import { Router, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { RoomModel } from "../models/Room";
import { DocumentModel } from "../models/Document";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { getRoomMemoryState, deleteRoomFromMemory, setRoomAccessSetting, getRoomAccessSetting } from "../socket/collabSocket";

const router = Router();

// Helper to create room (accepts client requested roomId if valid)
async function handleCreateRoom(req: AuthRequest, res: Response) {
  try {
    const { name, description, defaultRole, roomId: clientRoomId } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Room name is required." });
      return;
    }

    let roomId = clientRoomId ? String(clientRoomId).trim().toUpperCase() : "";
    if (!roomId || !/^CS-[A-Z0-9]{4,12}$/.test(roomId)) {
      roomId = "CS-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    }

    let ownerObjId: mongoose.Types.ObjectId;
    try {
      ownerObjId = new mongoose.Types.ObjectId(req.user!.userId);
    } catch {
      ownerObjId = new mongoose.Types.ObjectId("000000000000000000000001");
    }

    // Check if room with this roomId already exists
    let room = await RoomModel.findOne({ roomId });
    if (room) {
      if (room.ownerId.toString() === req.user!.userId) {
        room.name = name.trim();
        if (description !== undefined) room.description = description.trim();
        if (room.hiddenForUsers && room.hiddenForUsers.length > 0) {
          room.hiddenForUsers = room.hiddenForUsers.filter(
            (id) => id.toString() !== req.user!.userId
          );
        }
        await room.save();
      }
    } else {
      room = await RoomModel.create({
        roomId,
        name: name.trim(),
        description: (description || "").trim(),
        ownerId: ownerObjId,
        authorizedMembers: [{ userId: ownerObjId, role: "owner", joinedAt: new Date() }],
        accessSettings: {
          allowLinkJoin: true,
          defaultRole: defaultRole === "viewer" ? "viewer" : "editor"
        },
        hiddenForUsers: []
      });
    }

    let doc = await DocumentModel.findOne({ roomId });
    if (!doc) {
      doc = await DocumentModel.create({
        roomId,
        title: name.trim(),
        htmlContent: `<h1>${name.trim()}</h1><p>${description ? description.trim() : "Start collaborating in real time..."}</p>`,
        metadata: { wordCount: 6, charCount: 42, lastEditedBy: req.user!.fullName }
      });
    }

    const isViewer = defaultRole === "viewer";
    setRoomAccessSetting(roomId, isViewer ? "readonly" : "edit", isViewer ? "viewer" : "editor");

    res.status(201).json({ room, document: doc });
  } catch (err) {
    console.error("[roomRoutes] handleCreateRoom error:", err);
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

    const match = String(identifier).toUpperCase().match(/CS-[A-Z0-9]{4,12}/);
    const cleanRoomId = match ? match[0] : String(identifier).trim().toUpperCase();

    const room = await RoomModel.findOne({ roomId: cleanRoomId });
    if (!room) {
      res.status(404).json({ error: `Room '${cleanRoomId}' was not found or is no longer available.` });
      return;
    }

    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(req.user!.userId);
    } catch {}

    const isMember = room.authorizedMembers.some(
      (m) => m.userId.toString() === req.user!.userId
    );
    if (!isMember) {
      if (!room.accessSettings.allowLinkJoin) {
        res.status(403).json({ error: "You do not have permission to join this private room." });
        return;
      }
      room.authorizedMembers.push({
        userId: (userObjId || req.user!.userId) as any,
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

// Clear personal room history (preserves shared rooms for other users unless permanentDeleteOwned is true)
router.post("/clear-history", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { permanentDeleteOwned } = req.body;
    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(userId);
    } catch {}

    const userIds: any[] = userObjId ? [userObjId, userId] : [userId];

    // 1. Remove user from all joined rooms
    const joinedResult = await RoomModel.updateMany(
      {
        ownerId: { $nin: userIds },
        "authorizedMembers.userId": { $in: userIds }
      },
      {
        $pull: { authorizedMembers: { userId: { $in: userIds } } }
      }
    );

    // 2. Handle owned rooms
    if (permanentDeleteOwned) {
      const ownedRooms = await RoomModel.find({ ownerId: { $in: userIds } });
      for (const r of ownedRooms) {
        deleteRoomFromMemory(r.roomId);
      }
      await RoomModel.deleteMany({ ownerId: { $in: userIds } });
      await DocumentModel.deleteMany({ roomId: { $in: ownedRooms.map((r) => r.roomId) } });
    } else {
      if (userObjId) {
        await RoomModel.updateMany(
          { ownerId: { $in: userIds } },
          { $addToSet: { hiddenForUsers: userObjId } }
        );
      }
    }

    res.json({
      success: true,
      message: permanentDeleteOwned
        ? "Permanently deleted your owned rooms and cleared personal room history."
        : "Successfully cleared all rooms from your personal dashboard history.",
      clearedJoinedCount: joinedResult.modifiedCount
    });
  } catch (err) {
    console.error("[roomRoutes] Error in /clear-history:", err);
    res.status(500).json({ error: "Failed to clear room history." });
  }
});

// Hide single room from user's dashboard history
router.post("/:roomId/hide", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = roomId.trim().toUpperCase();
    const userId = req.user!.userId;
    let userObjId: mongoose.Types.ObjectId | null = null;
    try {
      userObjId = new mongoose.Types.ObjectId(userId);
    } catch {}

    const userIds: any[] = userObjId ? [userObjId, userId] : [userId];

    await RoomModel.updateOne(
      { roomId: cleanRoomId, ownerId: { $nin: userIds } },
      { $pull: { authorizedMembers: { userId: { $in: userIds } } } }
    );

    if (userObjId) {
      await RoomModel.updateOne(
        { roomId: cleanRoomId, ownerId: { $in: userIds } },
        { $addToSet: { hiddenForUsers: userObjId } }
      );
    }

    res.json({ success: true, message: `Removed ${cleanRoomId} from dashboard history.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to hide room from history." });
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
      res.status(400).json({ error: "Room owners cannot leave their own room. You can delete it or hide it from history." });
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

// Delete an owned room permanently
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

    deleteRoomFromMemory(cleanRoomId);

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

    const userIds: any[] = userObjId ? [userObjId, userId] : [userId];

    const matchConditions: any[] = [
      { ownerId: { $in: userIds } },
      { "authorizedMembers.userId": { $in: userIds } }
    ];

    const rooms = await RoomModel.find({
      $or: matchConditions,
      hiddenForUsers: { $nin: userIds }
    })
      .sort({ updatedAt: -1 })
      .limit(40);

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

    let room: any = null;
    let doc = null;
    try {
      room = await RoomModel.findOne({ roomId: cleanRoomId }).populate("ownerId", "fullName username email");
      doc = await DocumentModel.findOne({ roomId: cleanRoomId });
    } catch {}

    if (!room && !mem.doc && !mem.owner) {
      res.status(404).json({ error: "Room not found." });
      return;
    }

    const ownerDoc = room && typeof room.ownerId === "object" && room.ownerId !== null ? room.ownerId : null;
    const hostUserId = ownerDoc?._id?.toString() || (typeof room?.ownerId === "string" ? room.ownerId : room?.ownerId?.toString()) || mem.owner?.userId || "";
    const hostFullName = ownerDoc?.fullName || ownerDoc?.username || mem.owner?.fullName || mem.owner?.username || "Room Host";
    const hostUsername = ownerDoc?.username || mem.owner?.username || "";

    const hostUser = mem.owner || (hostUserId ? {
      userId: hostUserId,
      fullName: hostFullName,
      username: hostUsername,
      role: "Host"
    } : null);

    const accessSetting = getRoomAccessSetting(cleanRoomId);
    const isReadOnly = accessSetting.access === "readonly" || room?.accessSettings?.defaultRole === "viewer";

    res.json({
      room: room ? {
        ...room.toObject(),
        ownerId: hostUserId,
        ownerName: hostFullName,
        access: isReadOnly ? "readonly" : "edit",
        accessSettings: {
          ...room.accessSettings,
          defaultRole: isReadOnly ? "viewer" : (room.accessSettings?.defaultRole || "editor")
        }
      } : {
        roomId: cleanRoomId,
        name: mem.doc?.title || `Workspace ${cleanRoomId}`,
        ownerId: hostUserId || "remote-host",
        ownerName: hostFullName || "Host",
        access: isReadOnly ? "readonly" : (mem.access || "open"),
        accessSettings: {
          allowLinkJoin: true,
          defaultRole: isReadOnly ? "viewer" : (mem.defaultRole || "editor")
        }
      },
      document: doc || {
        roomId: cleanRoomId,
        title: mem.doc?.title || `Workspace ${cleanRoomId}`,
        htmlContent: mem.doc?.htmlContent || "<p>Start collaborating in real time...</p>"
      },
      hostUser,
      participants: mem.participants,
      projectedFiles: mem.projectedFiles || [],
      latestProjectedFile: mem.latestProjectedFile || null
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room details." });
  }
});

export default router;
