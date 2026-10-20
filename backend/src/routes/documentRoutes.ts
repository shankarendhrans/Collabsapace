import { Router, Response } from "express";
import multer from "multer";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import sanitizeHtml from "sanitize-html";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { DocumentModel } from "../models/Document";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB limit
});

router.post("/import/:roomId", requireAuth, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
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
        .map((p) => `<p>${sanitizeHtml(p).replace(/\r?\n/g, "<br/>")}</p>`)
        .join("");
    } else if (ext === "md") {
      const md = file.buffer.toString("utf-8");
      extractedHtml = md
        .split(/\r?\n/)
        .map((line) => {
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
        .filter((l) => l.trim())
        .map((l) => `<p>${sanitizeHtml(l.trim())}</p>`)
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

export default router;
