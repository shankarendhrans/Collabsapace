import { Router, Response } from "express";
import crypto from "crypto";
import { RoomModel } from "../models/Room";
import { DocumentModel } from "../models/Document";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/create", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, defaultRole } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Room name is required." });
      return;
    }

    const roomId = "CS-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const room = await RoomModel.create({
      roomId,
      name: name.trim(),
      description: (description || "").trim(),
      ownerId: req.user!.userId,
      authorizedMembers: [{ userId: req.user!.userId as any, role: "owner", joinedAt: new Date() }],
      accessSettings: {
        allowLinkJoin: true,
        defaultRole: defaultRole === "viewer" ? "viewer" : "editor"
      }
    });

    const doc = await DocumentModel.create({
      roomId,
      title: name.trim(),
      htmlContent: `<h1>${name.trim()}</h1><p>${description ? description.trim() : "Start collaborating in real time..."}</p>`,
      metadata: { wordCount: 6, charCount: 42, lastEditedBy: req.user!.fullName }
    });

    res.status(201).json({ room, document: doc });
  } catch (err) {
    res.status(500).json({ error: "Failed to create room." });
  }
});

router.post("/join", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roomIdentifier } = req.body;
    if (!roomIdentifier) {
      res.status(400).json({ error: "Room ID or invitation link is required." });
      return;
    }

    const match = String(roomIdentifier).toUpperCase().match(/CS-[A-Z0-9]{4,10}/);
    const cleanRoomId = match ? match[0] : String(roomIdentifier).trim().toUpperCase();

    const room = await RoomModel.findOne({ roomId: cleanRoomId });
    if (!room) {
      res.status(404).json({ error: `Room '${cleanRoomId}' was not found or is no longer available.` });
      return;
    }

    const isMember = room.authorizedMembers.some(
      (m) => m.userId.toString() === req.user!.userId
    );
    if (!isMember) {
      if (!room.accessSettings.allowLinkJoin) {
        res.status(403).json({ error: "You do not have permission to join this private room." });
        return;
      }
      room.authorizedMembers.push({
        userId: req.user!.userId as any,
        role: room.accessSettings.defaultRole,
        joinedAt: new Date()
      });
      await room.save();
    }

    const doc = await DocumentModel.findOne({ roomId: cleanRoomId });
    res.json({ room, document: doc });
  } catch (err) {
    res.status(500).json({ error: "Unable to join room." });
  }
});

router.get("/recent", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await RoomModel.find({
      "authorizedMembers.userId": req.user!.userId
    })
      .sort({ updatedAt: -1 })
      .limit(12);
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: "Unable to load recent rooms." });
  }
});

export default router;
