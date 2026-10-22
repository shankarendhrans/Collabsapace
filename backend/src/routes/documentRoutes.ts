import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import sanitizeHtml from "sanitize-html";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { DocumentModel } from "../models/Document";
import { addRoomProjectedFile, getRoomProjectedFiles, getRoomAccessSetting, getRoomMemoryState } from "../socket/collabSocket";

const router = Router();
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB limit
});

router.post("/import/:roomId", requireAuth, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    const ext = (file.originalname.split(".").pop() || "").toLowerCase();
    let extractedHtml = "";
    let importNotice = "";

    if (ext === "txt") {
      const text = file.buffer.toString("utf-8");
      extractedHtml = text
        .split(/\r?\n\r?\n/)
        .map((p: string) => `<p>${sanitizeHtml(p).replace(/\r?\n/g, "<br/>")}</p>`)
        .join("");
    } else if (ext === "md") {
      const md = file.buffer.toString("utf-8");
      extractedHtml = md
        .split(/\r?\n/)
        .map((line: string) => {
          if (line.startsWith("### ")) return `<h3>${sanitizeHtml(line.slice(4))}</h3>`;
          if (line.startsWith("## ")) return `<h2>${sanitizeHtml(line.slice(3))}</h2>`;
          if (line.startsWith("# ")) return `<h1>${sanitizeHtml(line.slice(2))}</h1>`;
          if (line.startsWith("- ") || line.startsWith("* ")) return `<li>${sanitizeHtml(line.slice(2))}</li>`;
          return line.trim() ? `<p>${sanitizeHtml(line)}</p>` : "";
        })
        .join("");
    } else if (ext === "docx") {
      const result = await mammoth.convertToHtml({ buffer: file.buffer });
      extractedHtml = sanitizeHtml(result.value);
    } else if (ext === "pdf") {
      const pdfData = await pdfParse(file.buffer);
      const paragraphs = (pdfData.text || "")
        .split(/\n\s*\n/)
        .map((p: string) => p.trim())
        .filter(Boolean);
      extractedHtml = paragraphs.map((p: string) => `<p>${sanitizeHtml(p)}</p>`).join("");
      importNotice =
        "PDF text extracted into editable paragraphs. Fixed page breaks, multi-column coordinates, and vector tables cannot be preserved identically in flow mode—switch to PDF Annotation Mode if exact page layout markup is required.";
    } else if (ext === "html" || ext === "htm") {
      extractedHtml = sanitizeHtml(file.buffer.toString("utf-8"), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "span", "mark", "u", "s"])
      });
    } else if (ext === "rtf") {
      const rawRtf = file.buffer.toString("utf-8");
      const stripped = rawRtf
        .replace(/\\par[d]?/g, "\n")
        .replace(/\{\\[^{}]+\}/g, "")
        .replace(/\\[a-zA-Z0-9]+\s?/g, "")
        .replace(/[{}]/g, "");
      extractedHtml = stripped
        .split(/\n+/)
        .filter((l: string) => l.trim())
        .map((l: string) => `<p>${sanitizeHtml(l.trim())}</p>`)
        .join("");
    } else {
      res.status(415).json({
        error: `Unsupported file format '.${ext}'. Supported formats: .txt, .md, .docx, .pdf, .rtf, .html.`
      });
      return;
    }

    const doc = await DocumentModel.findOneAndUpdate(
      { roomId: req.params.roomId },
      {
        htmlContent: extractedHtml,
        originalImportedFile: {
          filename: file.originalname,
          mimeType: file.mimetype,
          rawContent: extractedHtml,
          importedAt: new Date()
        }
      },
      { new: true }
    );

    res.json({ htmlContent: extractedHtml, importNotice, document: doc });
  } catch (err) {
    res.status(422).json({
      error: "File could not be parsed. It may be password-protected, encrypted, or corrupted."
    });
  }
});

// Real-Time File Upload and Projection for Collaboration
router.post("/upload/:roomId", optionalAuth, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    const { roomId } = req.params;
    if (!roomId) {
      res.status(400).json({ error: "Room ID is required." });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    const cleanRoomId = roomId.trim().toUpperCase();
    const accessSetting = getRoomAccessSetting(cleanRoomId);

    // Permission enforcement: if room is in read-only mode, only the host/owner can upload
    if (accessSetting.access === "readonly") {
      const uploaderId = req.user?.userId;
      const memState = getRoomMemoryState(cleanRoomId);
      const isOwner = memState.owner?.userId && uploaderId && memState.owner.userId === uploaderId;
      if (!isOwner) {
        res.status(403).json({
          error: "Permission denied. In Read-Only Viewer Mode, only the room host can upload reference files."
        });
        return;
      }
    }

    const fileId = crypto.randomUUID();
    const originalExt = (file.originalname.split(".").pop() || "").toLowerCase();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const diskFileName = `${fileId}_${sanitizedName}`;
    const diskPath = path.join(UPLOADS_DIR, diskFileName);

    fs.writeFileSync(diskPath, file.buffer);

    const fileUrl = `/api/documents/files/${fileId}`;
    let projectedHtml = "";
    let extractedTextHtml = "";

    if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(originalExt)) {
      projectedHtml = `
        <div class="projected-sheet p-6 text-center space-y-4">
          <div class="flex items-center justify-between text-xs text-slate-500 border-b pb-2">
            <span class="font-bold text-slate-700">${file.originalname}</span>
            <span class="font-mono">Projected Visual Asset</span>
          </div>
          <img src="${fileUrl}" alt="${file.originalname}" class="max-w-full h-auto mx-auto rounded-xl shadow-lg border border-slate-200" />
        </div>
      `;
      extractedTextHtml = `<p><img src="${fileUrl}" alt="${file.originalname}" /></p>`;
    } else if (originalExt === "docx" || originalExt === "doc") {
      try {
        const result = await mammoth.convertToHtml({ buffer: file.buffer });
        extractedTextHtml = sanitizeHtml(result.value || "<p>(Document loaded)</p>");
        projectedHtml = `
          <div class="projected-sheet p-8 sm:p-12 space-y-4">
            <div class="flex items-center justify-between text-xs text-slate-500 border-b pb-3">
              <span class="font-bold text-slate-700 text-sm">${file.originalname}</span>
              <a href="${fileUrl}" download class="px-2.5 py-1 rounded bg-indigo-600 text-white font-semibold">Download Original .DOCX</a>
            </div>
            <div class="prose max-w-none text-slate-800 leading-relaxed">${extractedTextHtml}</div>
          </div>
        `;
      } catch {
        extractedTextHtml = `<p>${file.originalname} loaded.</p>`;
        projectedHtml = `<div class="projected-sheet p-8 sm:p-12"><p>${file.originalname} loaded.</p></div>`;
      }
    } else if (originalExt === "pdf") {
      let pdfText = "";
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = (pdfData.text || "")
          .split(/\n\s*\n/)
          .map((p: string) => `<p>${sanitizeHtml(p.trim())}</p>`)
          .join("");
      } catch {}

      extractedTextHtml = pdfText;
      projectedHtml = `
        <div class="projected-sheet p-8 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 text-xs text-slate-500">
            <span class="font-bold text-slate-700 text-sm">${file.originalname}</span>
            <div class="flex items-center gap-2">
              <a href="${fileUrl}" target="_blank" class="px-2.5 py-1 rounded bg-indigo-600 text-white font-semibold">Open Full PDF ↗</a>
              <a href="${fileUrl}" download class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 font-semibold">Download</a>
            </div>
          </div>
          <div class="prose max-w-none text-sm text-slate-800 leading-relaxed space-y-2">
            ${pdfText || "<p class='italic text-slate-500'>PDF Document Loaded. Click 'Open Full PDF' to view original pages.</p>"}
          </div>
        </div>
      `;
    } else if (originalExt === "md") {
      const text = file.buffer.toString("utf-8");
      const lines = text.split(/\r?\n/).map((line: string) => {
        if (line.startsWith("### ")) return `<h3>${sanitizeHtml(line.slice(4))}</h3>`;
        if (line.startsWith("## ")) return `<h2>${sanitizeHtml(line.slice(3))}</h2>`;
        if (line.startsWith("# ")) return `<h1>${sanitizeHtml(line.slice(2))}</h1>`;
        if (line.startsWith("- ") || line.startsWith("* ")) return `<li>${sanitizeHtml(line.slice(2))}</li>`;
        return line.trim() ? `<p>${sanitizeHtml(line)}</p>` : "";
      }).join("");

      extractedTextHtml = lines;
      projectedHtml = `<div class="projected-sheet p-8 sm:p-12 space-y-3"><div class="flex justify-between border-b pb-2 text-xs text-slate-500"><span class="font-bold">${file.originalname}</span><span>Markdown</span></div>${lines}</div>`;
    } else {
      const raw = file.buffer.toString("utf-8");
      const safe = sanitizeHtml(raw);
      extractedTextHtml = `<pre style="white-space: pre-wrap; font-family: inherit;">${safe}</pre>`;
      projectedHtml = `
        <div class="projected-sheet p-8 sm:p-12 space-y-3">
          <div class="flex justify-between border-b pb-2 text-xs text-slate-500"><span class="font-bold">${file.originalname}</span><span>Text Document</span></div>
          <pre style="white-space: pre-wrap; font-family: inherit; font-size: 0.95rem; line-height: 1.75;">${safe}</pre>
        </div>
      `;
    }

    const uploaderUser = req.user ? {
      userId: req.user.userId,
      fullName: req.user.fullName,
      username: req.user.username
    } : {
      userId: "guest",
      fullName: "Collaborator",
      username: "collaborator"
    };

    const fileRecord = {
      id: fileId,
      fileId,
      name: file.originalname,
      ext: originalExt,
      size: file.size,
      mimeType: file.mimetype,
      url: fileUrl,
      projectedHtml,
      extractedTextHtml,
      uploadedBy: uploaderUser.fullName,
      uploadedAt: new Date().toISOString()
    };

    // Store in shared room memory and broadcast over Socket.IO immediately
    addRoomProjectedFile(cleanRoomId, fileRecord, true);

    res.status(201).json({ success: true, fileRecord });
  } catch (err: any) {
    console.error("[documentRoutes] /upload error:", err);
    res.status(500).json({ error: "Failed to upload and project file." });
  }
});

// Download / View Uploaded File by ID
router.get("/files/:fileId", (req: any, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) {
      res.status(400).json({ error: "Invalid file identifier." });
      return;
    }

    const files = fs.readdirSync(UPLOADS_DIR);
    const targetFile = files.find((f) => f.startsWith(`${fileId}_`));

    if (!targetFile) {
      res.status(404).json({ error: "File not found or expired." });
      return;
    }

    const filePath = path.join(UPLOADS_DIR, targetFile);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Unable to retrieve file." });
  }
});

// Retrieve all projected files for a room
router.get("/projected/:roomId", (req: any, res: Response) => {
  const { roomId } = req.params;
  const cleanRoomId = (roomId || "").trim().toUpperCase();
  const files = getRoomProjectedFiles(cleanRoomId);
  res.json({ files });
});

export default router;
