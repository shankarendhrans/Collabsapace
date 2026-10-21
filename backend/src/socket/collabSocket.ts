import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { DocumentModel } from "../models/Document";
import { RoomModel } from "../models/Room";

export interface Participant {
  socketId: string;
  userId: string;
  username: string;
  fullName: string;
  role: "Host" | "Collaborator";
  color: string;
  joinedAt: number;
}

export interface PublicParticipant {
  userId: string;
  username: string;
  fullName: string;
  role: "Host" | "Collaborator";
  color: string;
  status: "online";
}

// In-memory state tracking per room
const roomYDocs = new Map<string, Y.Doc>();
const roomDocs = new Map<string, { title: string; htmlContent: string }>();
const roomParticipants = new Map<string, Map<string, Participant>>();
const roomOwners = new Map<string, { userId: string; fullName: string; username: string; color: string }>();
const roomVersions = new Map<string, number>();
const saveTimeouts = new Map<string, NodeJS.Timeout>();

const AVATAR_COLORS = [
  "#2563eb", // Blue
  "#7c3aed", // Violet
  "#059669", // Emerald
  "#d97706", // Amber
  "#dc2626", // Red
  "#db2777", // Pink
  "#0891b2", // Cyan
  "#4f46e5"  // Indigo
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getDeduplicatedParticipants(roomId: string): PublicParticipant[] {
  const socketMap = roomParticipants.get(roomId);
  const uniqueByUser = new Map<string, PublicParticipant>();

  if (socketMap) {
    for (const participant of socketMap.values()) {
      const existing = uniqueByUser.get(participant.userId);
      if (!existing || participant.role === "Host") {
        uniqueByUser.set(participant.userId, {
          userId: participant.userId,
          username: participant.username,
          fullName: participant.fullName,
          role: participant.role,
          color: participant.color,
          status: "online"
        });
      }
    }
  }

  // If host is known from roomOwners but not yet connected in socketMap, preserve host in participant list
  const hostOwner = roomOwners.get(roomId);
  if (hostOwner && !Array.from(uniqueByUser.values()).some((p) => p.role === "Host")) {
    uniqueByUser.set(hostOwner.userId, {
      userId: hostOwner.userId,
      username: hostOwner.username,
      fullName: hostOwner.fullName,
      role: "Host",
      color: hostOwner.color,
      status: "online"
    });
  }

  const list: PublicParticipant[] = Array.from(uniqueByUser.values());

  // Host always at the top of the participant list
  return list.sort((a, b) => {
    if (a.role === "Host" && b.role !== "Host") return -1;
    if (b.role === "Host" && a.role !== "Host") return 1;
    return a.fullName.localeCompare(b.fullName);
  });
}

function queueSaveDocument(roomId: string, title: string, htmlContent: string, ydoc?: Y.Doc, lastEditedBy?: string) {
  roomDocs.set(roomId, { title: title || "Untitled Document", htmlContent });

  if (saveTimeouts.has(roomId)) {
    clearTimeout(saveTimeouts.get(roomId)!);
  }

  // Only persist to database if Mongoose is actively connected
  if (mongoose.connection.readyState !== 1) return;

  const timeout = setTimeout(async () => {
    saveTimeouts.delete(roomId);
    try {
      const crdtStateBase64 = ydoc ? Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64") : undefined;
      const plain = htmlContent.replace(/<[^>]*>/g, " ").trim();
      const wordCount = plain ? plain.split(/\s+/).length : 0;

      await DocumentModel.findOneAndUpdate(
        { roomId },
        {
          title: title || "Untitled Document",
          htmlContent,
          ...(crdtStateBase64 ? { crdtStateBase64 } : {}),
          metadata: {
            wordCount,
            charCount: plain.length,
            lastEditedBy: lastEditedBy || "Collaborator"
          }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[CollabSocket] Error saving document for room ${roomId}:`, err);
    }
  }, 1200);

  saveTimeouts.set(roomId, timeout);
}

export function getRoomMemoryState(roomId: string) {
  const clean = roomId.trim().toUpperCase();
  return {
    owner: roomOwners.get(clean),
    doc: roomDocs.get(clean),
    participants: getDeduplicatedParticipants(clean)
  };
}

export function setupCollabSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUser: Participant | null = null;

    socket.on("join-room", async (payload: { roomId: string; roomTitle?: string; contentHtml?: string; user?: any; token?: string }) => {
      try {
        const { roomId, token } = payload;
        if (!roomId) return;

        const cleanRoomId = roomId.trim().toUpperCase();
        currentRoomId = cleanRoomId;
        socket.join(cleanRoomId);

        // Resolve user identity
        let userId = "";
        let fullName = "Collaborator";
        let username = "collaborator";

        if (token) {
          try {
            const secret = process.env.JWT_SECRET || "collabspace_jwt_secret_dev_key_2026_a98b7c6d5e4f3a2b1c";
            const decoded = jwt.verify(token, secret) as any;
            if (decoded) {
              userId = decoded.userId || decoded.id || "";
              fullName = decoded.fullName || fullName;
              username = decoded.username || username;
            }
          } catch {}
        }

        if (!userId && payload.user) {
          userId = payload.user.userId || payload.user.id || "";
          fullName = payload.user.fullName || payload.user.name || fullName;
          username = payload.user.username || username;
        }

        if (!userId) {
          userId = "anon-" + socket.id.slice(0, 8);
          fullName = payload.user?.fullName || `User-${socket.id.slice(0, 4)}`;
          username = `user_${socket.id.slice(0, 4)}`;
        }

        // Check if user is Host (owner of the room)
        const knownOwner = roomOwners.get(cleanRoomId);
        let role: "Host" | "Collaborator" = "Collaborator";

        if (knownOwner) {
          if (knownOwner.userId === userId || (username && knownOwner.username === username)) {
            role = "Host";
          } else {
            role = "Collaborator";
          }
        } else if (payload.user?.role === "Host" || payload.user?.fullName?.includes("(Host)")) {
          role = "Host";
        } else if (payload.user?.role === "Collaborator") {
          role = "Collaborator";
        } else if (mongoose.connection.readyState === 1) {
          try {
            const room = await RoomModel.findOne({ roomId: cleanRoomId });
            if (room && room.ownerId && room.ownerId.toString() === userId) {
              role = "Host";
            }
          } catch {}
        } else if (!roomParticipants.has(cleanRoomId) || roomParticipants.get(cleanRoomId)!.size === 0) {
          role = "Host";
        }

        currentUser = {
          socketId: socket.id,
          userId,
          username,
          fullName,
          role,
          color: getUserColor(userId),
          joinedAt: Date.now()
        };

        if (role === "Host") {
          roomOwners.set(cleanRoomId, {
            userId,
            fullName,
            username,
            color: currentUser.color
          });

          if (mongoose.connection.readyState === 1) {
            try {
              const isValidObjId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;
              const ownerObjId = isValidObjId ? new mongoose.Types.ObjectId(userId) : new mongoose.Types.ObjectId("000000000000000000000001");
              RoomModel.findOneAndUpdate(
                { roomId: cleanRoomId },
                {
                  roomId: cleanRoomId,
                  name: payload.roomTitle || "Untitled Room",
                  ownerId: ownerObjId,
                  $setOnInsert: {
                    authorizedMembers: [{ userId: ownerObjId, role: "owner", joinedAt: new Date() }],
                    accessSettings: { allowLinkJoin: true, defaultRole: "editor" }
                  }
                },
                { upsert: true }
              ).catch(() => {});
            } catch {}
          }
        }

        if (!roomParticipants.has(cleanRoomId)) {
          roomParticipants.set(cleanRoomId, new Map());
        }
        roomParticipants.get(cleanRoomId)!.set(socket.id, currentUser);

        // Initialize Y.Doc and Document State
        let ydoc = roomYDocs.get(cleanRoomId);
        if (!ydoc) {
          ydoc = new Y.Doc();
          roomYDocs.set(cleanRoomId, ydoc);
        }

        let docTitle = payload.roomTitle || "Untitled Document";
        let docContent = payload.contentHtml || "<h1>" + cleanRoomId + "</h1><p>Start collaborating in real time...</p>";

        if (payload.contentHtml && role === "Host") {
          docContent = payload.contentHtml;
          docTitle = payload.roomTitle || docTitle;
          roomDocs.set(cleanRoomId, { title: docTitle, htmlContent: docContent });
        } else if (roomDocs.has(cleanRoomId)) {
          const cached = roomDocs.get(cleanRoomId)!;
          docTitle = cached.title;
          docContent = cached.htmlContent;
        } else if (mongoose.connection.readyState === 1) {
          try {
            const doc = await DocumentModel.findOne({ roomId: cleanRoomId });
            if (doc) {
              docTitle = doc.title;
              docContent = doc.htmlContent;
              if (doc.crdtStateBase64) {
                try {
                  const buf = Buffer.from(doc.crdtStateBase64, "base64");
                  Y.applyUpdate(ydoc, new Uint8Array(buf));
                } catch {}
              }
            }
          } catch {}
        }
        roomDocs.set(cleanRoomId, { title: docTitle, htmlContent: docContent });

        const currentVersion = (roomVersions.get(cleanRoomId) || 0) + 1;
        roomVersions.set(cleanRoomId, currentVersion);

        const fullStateBase64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");

        const hostOwner = roomOwners.get(cleanRoomId);

        // 1. Send authoritative document state to newly joined socket
        socket.emit("init-document", {
          roomId: cleanRoomId,
          title: docTitle,
          contentHtml: docContent,
          crdtUpdateBase64: fullStateBase64,
          crdtVersion: currentVersion,
          role: currentUser.role,
          isHost: currentUser.role === "Host",
          hostUser: hostOwner || (currentUser.role === "Host" ? currentUser : undefined)
        });

        // Backwards compatibility for existing crdtService listeners
        socket.emit("crdt-init", {
          stateBase64: fullStateBase64,
          contentHtml: docContent,
          title: docTitle
        });

        // 2. Broadcast complete, authoritative participant list to EVERYONE in the room
        const activeParticipants = getDeduplicatedParticipants(cleanRoomId);
        io.to(cleanRoomId).emit("participants-update", {
          roomId: cleanRoomId,
          participants: activeParticipants
        });
        io.to(cleanRoomId).emit("presence-update", activeParticipants);

        // 3. Notify others of the new collaborator
        socket.to(cleanRoomId).emit("collaborator-joined", {
          socketId: socket.id,
          user: currentUser
        });
      } catch (err) {
        console.error("[CollabSocket] Error in join-room:", err);
      }
    });

    // Real-time Text & CRDT Document Synchronization
    socket.on("doc-update", async (data: {
      roomId: string;
      contentHtml: string;
      title?: string;
      updateBase64?: string;
      crdtVersion?: number;
      user?: any;
    }) => {
      try {
        const { roomId, contentHtml, title, updateBase64 } = data;
        if (!roomId || contentHtml === undefined) return;

        const cleanRoomId = roomId.trim().toUpperCase();
        let ydoc = roomYDocs.get(cleanRoomId);
        if (!ydoc) {
          ydoc = new Y.Doc();
          roomYDocs.set(cleanRoomId, ydoc);
        }

        if (updateBase64) {
          try {
            const binary = Uint8Array.from(Buffer.from(updateBase64, "base64"));
            Y.applyUpdate(ydoc, binary);
          } catch {}
        }

        const newVersion = (roomVersions.get(cleanRoomId) || 0) + 1;
        roomVersions.set(cleanRoomId, newVersion);

        const senderUser = currentUser || {
          userId: data.user?.id || data.user?.userId || "anon",
          fullName: data.user?.fullName || "Collaborator",
          username: data.user?.username || "collaborator",
          role: "Collaborator" as const,
          color: "#2563eb",
          socketId: socket.id,
          joinedAt: Date.now()
        };

        const broadcastPayload = {
          roomId: cleanRoomId,
          contentHtml,
          title,
          updateBase64,
          crdtVersion: newVersion,
          userId: senderUser.userId,
          userName: senderUser.fullName,
          user: senderUser
        };

        // Broadcast to all other collaborators in the room
        socket.to(cleanRoomId).emit("doc-update", broadcastPayload);
        socket.to(cleanRoomId).emit("crdt-update", broadcastPayload);

        // Debounced persistence to MongoDB
        queueSaveDocument(cleanRoomId, title || "", contentHtml, ydoc, senderUser.fullName);
      } catch (err) {
        console.error("[CollabSocket] Error in doc-update:", err);
      }
    });

    // Handle crdt-update alias
    socket.on("crdt-update", async (data: any) => {
      socket.emit("doc-update-ack"); // acknowledge
      socket.to(data.roomId).emit("crdt-update", data);
      socket.to(data.roomId).emit("doc-update", {
        ...data,
        contentHtml: data.contentHtml || data.htmlSnapshot
      });
      if (data.roomId && (data.contentHtml || data.htmlSnapshot)) {
        queueSaveDocument(data.roomId, data.title || "", data.contentHtml || data.htmlSnapshot, undefined, data.user?.fullName);
      }
    });

    // Real-Time Remote Cursors
    socket.on("cursor-move", (data: { roomId: string; cursorPos?: number; cursor?: any }) => {
      if (!data.roomId) return;
      socket.to(data.roomId).emit("cursor-move", {
        socketId: socket.id,
        cursorPos: data.cursorPos,
        cursor: data.cursor,
        user: currentUser
      });
    });

    // Real-Time File Projection Sync
    socket.on("project-file", (data: { roomId: string; fileRecord: any; user?: any }) => {
      if (!data.roomId) return;
      socket.to(data.roomId).emit("project-file", data);
      socket.to(data.roomId).emit("PROJECTED_FILE_SYNC", data);
    });

    // Real-Time Canvas / Sketch Sync
    socket.on("sketch-update", (data: { roomId: string; targetCanvasId: string; dataUrl: string; user?: any }) => {
      if (!data.roomId) return;
      socket.to(data.roomId).emit("sketch-update", data);
      socket.to(data.roomId).emit("SKETCH_SYNC", data);
    });

    // Explicit Leave Room
    const handleLeaveRoom = (roomId: string) => {
      socket.leave(roomId);
      const roomMap = roomParticipants.get(roomId);
      if (roomMap) {
        roomMap.delete(socket.id);
        if (roomMap.size === 0) {
          roomParticipants.delete(roomId);
        } else {
          const updated = getDeduplicatedParticipants(roomId);
          io.to(roomId).emit("participants-update", {
            roomId,
            participants: updated
          });
          io.to(roomId).emit("presence-update", updated);
        }
      }

      socket.to(roomId).emit("collaborator-left", {
        socketId: socket.id,
        userId: currentUser?.userId,
        fullName: currentUser?.fullName
      });
    };

    socket.on("leave-room", (data: { roomId: string }) => {
      if (data.roomId) handleLeaveRoom(data.roomId);
    });

    socket.on("disconnecting", () => {
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          handleLeaveRoom(roomId);
        }
      }
    });
  });
}
