import { Router, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { RoomModel } from "../models/Room";
import { DocumentModel } from "../models/Document";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { getRoomMemoryState } from "../socket/collabSocket";

const router = Router();

// Helper to create room
async function handleCreateRoom(req: AuthRequest, res: Response) {
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
}

// Helper to join room
async function handleJoinRoom(identifier: string, req: AuthRequest, res: Response) {
  try {
    if (!identifier) {
      res.status(400).json({ error: "Room ID or invitation link is required." });
      return;
    }

    const match = String(identifier).toUpperCase().match(/CS-[A-Z0-9]{4,10}/);
    const cleanRoomId = match ? match[0] : String(identifier).trim().toUpperCase();

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

    let doc = await DocumentModel.findOne({ roomId: cleanRoomId });
    if (!doc) {
      doc = await DocumentModel.create({
        roomId: cleanRoomId,
        title: room.name,
        htmlContent: `<p>Start collaborating in real time...</p>`
      });
    }

    res.json({ room, document: doc });
  } catch (err) {
    res.status(500).json({ error: "Unable to join room." });
  }
}

router.post("/create", requireAuth, handleCreateRoom);
router.post("/", requireAuth, handleCreateRoom);

// Clear all rooms the current user joined as a collaborator/viewer
router.post("/clear-joined", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(userId);
    } catch {}

    const userIds: any[] = userObjId ? [userObjId, userId] : [userId];

    // Remove user from authorizedMembers in all rooms they do NOT own
    const result = await RoomModel.updateMany(
      {
        ownerId: { $nin: userIds },
        "authorizedMembers.userId": { $in: userIds }
      },
      {
        $pull: { authorizedMembers: { userId: { $in: userIds } } }
      }
    );

    res.json({
      success: true,
      message: "Successfully cleared all joined rooms.",
      clearedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear joined rooms." });
  }
});

router.post("/join", requireAuth, async (req: AuthRequest, res: Response) => {
  await handleJoinRoom(req.body.roomIdentifier, req, res);
});

router.post("/:roomId/join", requireAuth, async (req: AuthRequest, res: Response) => {
  await handleJoinRoom(req.params.roomId, req, res);
});

// Leave a specific room the user joined
router.post("/:roomId/leave", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = roomId.trim().toUpperCase();
    const userId = req.user!.userId;
    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(userId);
    } catch {}

    const userIds: any[] = userObjId ? [userObjId, userId] : [userId];

    const room = await RoomModel.findOne({ roomId: cleanRoomId });
    if (!room) {
      res.status(404).json({ error: "Room not found." });
      return;
    }

    if (room.ownerId.toString() === userId) {
      res.status(400).json({ error: "Room owners cannot leave their own room. You can delete it instead." });
      return;
    }

    await RoomModel.updateOne(
      { roomId: cleanRoomId },
      { $pull: { authorizedMembers: { userId: { $in: userIds } } } }
    );

    res.json({ success: true, message: `Successfully left room ${cleanRoomId}.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to leave room." });
  }
});

// Delete an owned room
router.delete("/:roomId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = roomId.trim().toUpperCase();
    const userId = req.user!.userId;

    const room = await RoomModel.findOne({ roomId: cleanRoomId });
    if (!room) {
      res.status(404).json({ error: "Room not found." });
      return;
    }

    if (room.ownerId.toString() !== userId) {
      res.status(403).json({ error: "Only the room owner can delete this room." });
      return;
    }

    await RoomModel.deleteOne({ roomId: cleanRoomId });
    await DocumentModel.deleteOne({ roomId: cleanRoomId });

    res.json({ success: true, message: `Room ${cleanRoomId} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room." });
  }
});

router.get("/recent", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(userId);
    } catch {}

    const matchConditions: any[] = [{ ownerId: userId }];
    if (userObjId) {
      matchConditions.push({ ownerId: userObjId });
      matchConditions.push({ "authorizedMembers.userId": userObjId });
    }
    matchConditions.push({ "authorizedMembers.userId": userId });

    const rooms = await RoomModel.find({ $or: matchConditions })
      .sort({ updatedAt: -1 })
      .limit(30);
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: "Unable to load recent rooms." });
  }
});

router.get("/:roomId", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = roomId.trim().toUpperCase();
    const mem = getRoomMemoryState(cleanRoomId);

    let room = null;
    let doc = null;
    try {
      room = await RoomModel.findOne({ roomId: cleanRoomId });
      doc = await DocumentModel.findOne({ roomId: cleanRoomId });
    } catch {}

    if (!room && !mem.doc && !mem.owner) {
      res.status(404).json({ error: "Room not found." });
      return;
    }

    res.json({
      room: room || {
        roomId: cleanRoomId,
        name: mem.doc?.title || `Workspace ${cleanRoomId}`,
        ownerId: mem.owner?.userId || "remote-host",
        ownerName: mem.owner?.fullName || "Host",
        access: "open"
      },
      document: doc || {
        roomId: cleanRoomId,
        title: mem.doc?.title || `Workspace ${cleanRoomId}`,
        htmlContent: mem.doc?.htmlContent || "<p>Start collaborating in real time...</p>"
      },
      hostUser: mem.owner,
      participants: mem.participants
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room details." });
  }
});

export default router;
