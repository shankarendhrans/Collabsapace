import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { DocumentModel } from "../models/Document";
import { RoomModel } from "../models/Room";

export type ParticipantRole = "Host" | "Collaborator" | "Viewer";

export interface Participant {
  socketId: string;
  userId: string;
  username: string;
  fullName: string;
  role: ParticipantRole;
  color: string;
  joinedAt: number;
}

export interface PublicParticipant {
  userId: string;
  username: string;
  fullName: string;
  role: ParticipantRole;
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
const roomSketches = new Map<string, Map<string, string>>();
const roomProjectedFiles = new Map<string, any[]>();
const roomAccessSettings = new Map<string, { defaultRole: "viewer" | "editor"; access: "readonly" | "edit" }>();

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

export function setRoomAccessSetting(roomId: string, access: "readonly" | "edit", defaultRole?: "viewer" | "editor") {
  const clean = roomId.trim().toUpperCase();
  roomAccessSettings.set(clean, {
    access,
    defaultRole: defaultRole || (access === "readonly" ? "viewer" : "editor")
  });
}

export function getRoomAccessSetting(roomId: string): { defaultRole: "viewer" | "editor"; access: "readonly" | "edit" } {
  const clean = roomId.trim().toUpperCase();
  return roomAccessSettings.get(clean) || { access: "edit", defaultRole: "editor" };
}

export function addRoomProjectedFile(roomId: string, fileRecord: any, broadcast = true) {
  const clean = roomId.trim().toUpperCase();
  if (!roomProjectedFiles.has(clean)) {
    roomProjectedFiles.set(clean, []);
  }
  const list = roomProjectedFiles.get(clean)!;
  const idx = list.findIndex((f) => f.id === fileRecord.id || (f.fileId && f.fileId === fileRecord.fileId));
  if (idx >= 0) {
    list[idx] = fileRecord;
  } else {
    list.push(fileRecord);
  }
  if (broadcast && globalIo) {
    globalIo.to(clean).emit("project-file", {
      roomId: clean,
      fileRecord
    });
    globalIo.to(clean).emit("PROJECTED_FILE_SYNC", {
      roomId: clean,
      projectedFile: fileRecord
    });
  }
  return fileRecord;
}

export function getRoomProjectedFiles(roomId: string): any[] {
  const clean = roomId.trim().toUpperCase();
  return roomProjectedFiles.get(clean) || [];
}

export function getRoomMemoryState(roomId: string) {
  const clean = roomId.trim().toUpperCase();
  const sketchMap = roomSketches.get(clean);
  const setting = roomAccessSettings.get(clean);
  const files = roomProjectedFiles.get(clean) || [];
  return {
    owner: roomOwners.get(clean),
    doc: roomDocs.get(clean),
    participants: getDeduplicatedParticipants(clean),
    sketches: sketchMap ? Object.fromEntries(sketchMap) : {},
    projectedFiles: files,
    latestProjectedFile: files.length > 0 ? files[files.length - 1] : null,
    access: setting?.access || "edit",
    defaultRole: setting?.defaultRole || "editor"
  };
}

let globalIo: Server | null = null;

export function deleteRoomFromMemory(roomId: string) {
  const clean = roomId.trim().toUpperCase();
  roomOwners.delete(clean);
  roomDocs.delete(clean);
  roomYDocs.delete(clean);
  roomParticipants.delete(clean);
  roomVersions.delete(clean);
  roomSketches.delete(clean);
  roomProjectedFiles.delete(clean);
  roomAccessSettings.delete(clean);
  if (saveTimeouts.has(clean)) {
    clearTimeout(saveTimeouts.get(clean)!);
    saveTimeouts.delete(clean);
  }
  if (globalIo) {
    globalIo.to(clean).emit("room-deleted", { roomId: clean });
  }
}

export function setupCollabSocket(io: Server): void {
  globalIo = io;
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUser: Participant | null = null;

    socket.on("join-room", async (payload: { roomId: string; roomTitle?: string; contentHtml?: string; user?: any; token?: string; role?: string }) => {
      try {
        const { roomId, token } = payload;
        if (!roomId) return;

        const cleanRoomId = roomId.trim().toUpperCase();

        if (currentRoomId && currentRoomId !== cleanRoomId) {
          socket.leave(currentRoomId);
          const oldMap = roomParticipants.get(currentRoomId);
          if (oldMap) {
            oldMap.delete(socket.id);
            if (oldMap.size === 0) {
              roomParticipants.delete(currentRoomId);
            } else {
              const updatedOld = getDeduplicatedParticipants(currentRoomId);
              io.to(currentRoomId).emit("participants-update", {
                roomId: currentRoomId,
                participants: updatedOld
              });
              io.to(currentRoomId).emit("presence-update", updatedOld);
            }
          }
        }

        currentRoomId = cleanRoomId;
        socket.join(cleanRoomId);

        // Resolve user identity
        let userId = "";
        let fullName = "Collaborator";
        let username = "collaborator";

        if (token) {
          try {
            const secret = process.env.JWT_SECRET || "dev_fallback_secret_do_not_use_in_prod";
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

        // Check if room exists in DB to resolve authoritative owner
        let dbRoom: any = null;
        if (mongoose.connection.readyState === 1) {
          try {
            dbRoom = await RoomModel.findOne({ roomId: cleanRoomId }).populate("ownerId", "fullName username email");
          } catch {}
        }

        if (dbRoom) {
          const ownerDoc = typeof dbRoom.ownerId === "object" && dbRoom.ownerId !== null ? dbRoom.ownerId : null;
          const trueOwnerId = ownerDoc?._id ? ownerDoc._id.toString() : (dbRoom.ownerId?.toString() || "");
          const trueOwnerFullName = ownerDoc?.fullName || ownerDoc?.username || "Room Host";
          const trueOwnerUsername = ownerDoc?.username || "";

          if (trueOwnerId && (!roomOwners.has(cleanRoomId) || !roomOwners.get(cleanRoomId)?.userId)) {
            roomOwners.set(cleanRoomId, {
              userId: trueOwnerId,
              fullName: trueOwnerFullName,
              username: trueOwnerUsername,
              color: getUserColor(trueOwnerId)
            });
          }
        }

        if (dbRoom && dbRoom.accessSettings) {
          const isViewerDef = dbRoom.accessSettings.defaultRole === "viewer";
          if (!roomAccessSettings.has(cleanRoomId) || isViewerDef) {
            roomAccessSettings.set(cleanRoomId, {
              defaultRole: isViewerDef ? "viewer" : "editor",
              access: isViewerDef ? "readonly" : "edit"
            });
          }
        }

        if ((payload as any).access === "readonly" || payload.role === "viewer" || (payload as any).defaultRole === "viewer") {
          roomAccessSettings.set(cleanRoomId, {
            defaultRole: "viewer",
            access: "readonly"
          });
        }

        const roomSetting = roomAccessSettings.get(cleanRoomId) || { access: "edit", defaultRole: "editor" };

        // Check if user is Host (owner of the room)
        const knownOwner = roomOwners.get(cleanRoomId);
        let role: ParticipantRole = "Collaborator";

        const isHost = () => {
          if (knownOwner && knownOwner.userId) {
            const sameId = !!(userId && knownOwner.userId === userId);
            const validCustomUsername = username && username !== "collaborator" && !username.startsWith("user_");
            const sameUser = !!(validCustomUsername && knownOwner.username === username);
            return sameId || sameUser;
          }
          if (dbRoom) {
            const ownerDoc = typeof dbRoom.ownerId === "object" && dbRoom.ownerId !== null ? dbRoom.ownerId : null;
            const trueOwnerId = ownerDoc?._id ? ownerDoc._id.toString() : (dbRoom.ownerId?.toString() || "");
            return !!(userId && trueOwnerId === userId);
          }
          if (payload.user?.role === "Host" || payload.role === "Host" || payload.user?.fullName?.includes("(Host)")) {
            return true;
          }
          if (!roomParticipants.has(cleanRoomId) || roomParticipants.get(cleanRoomId)!.size === 0) {
            return true;
          }
          return false;
        };

        if (isHost()) {
          role = "Host";
        } else if (roomSetting.access === "readonly" || roomSetting.defaultRole === "viewer" || payload.role === "Viewer" || payload.user?.role === "Viewer") {
          role = "Viewer";
        } else {
          role = "Collaborator";
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
              const isRo = (payload as any).access === "readonly" || payload.role === "viewer" || (payload as any).defaultRole === "viewer";
              const chosenRole = isRo ? "viewer" : "editor";
              const isValidObjId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;
              const ownerObjId = isValidObjId ? new mongoose.Types.ObjectId(userId) : new mongoose.Types.ObjectId("000000000000000000000001");
              await RoomModel.findOneAndUpdate(
                { roomId: cleanRoomId },
                {
                  $set: {
                    name: payload.roomTitle || "Untitled Room",
                    updatedAt: new Date(),
                    ...(isRo ? { "accessSettings.defaultRole": "viewer" } : {})
                  },
                  $setOnInsert: {
                    roomId: cleanRoomId,
                    ownerId: ownerObjId,
                    authorizedMembers: [{ userId: ownerObjId, role: "owner", joinedAt: new Date() }],
                    accessSettings: { allowLinkJoin: true, defaultRole: chosenRole }
                  }
                },
                { upsert: true }
              ).catch(() => {});
            } catch {}
          }
        } else {
          // Collaborator joined - ensure they are in authorizedMembers without modifying owner
          if (mongoose.connection.readyState === 1) {
            try {
              const isValidObjId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;
              const memberObjId = isValidObjId ? new mongoose.Types.ObjectId(userId) : null;
              if (memberObjId) {
                await RoomModel.updateOne(
                  { roomId: cleanRoomId, "authorizedMembers.userId": { $ne: memberObjId } },
                  { $push: { authorizedMembers: { userId: memberObjId, role: "editor", joinedAt: new Date() } } }
                ).catch(() => {});
              }
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
        const defaultDocContent = `<h1>${cleanRoomId}</h1><p>Start collaborating in real time...</p>`;
        let docContent = defaultDocContent;

        const isPlaceholderText = (html?: string) => {
          if (!html) return true;
          return html.includes("Connecting to shared workspace...") ||
                 html.includes("Connecting to server...") ||
                 html.includes("Loading collaborative document");
        };

        if (roomDocs.has(cleanRoomId)) {
          const cached = roomDocs.get(cleanRoomId)!;
          docTitle = cached.title || docTitle;
          docContent = cached.htmlContent;
        } else if (mongoose.connection.readyState === 1) {
          try {
            const doc = await DocumentModel.findOne({ roomId: cleanRoomId });
            if (doc) {
              docTitle = doc.title || docTitle;
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

        if (payload.contentHtml && role === "Host" && !isPlaceholderText(payload.contentHtml)) {
          docContent = payload.contentHtml;
          docTitle = payload.roomTitle || docTitle;
        }

        if (isPlaceholderText(docContent)) {
          docContent = defaultDocContent;
        }

        roomDocs.set(cleanRoomId, { title: docTitle, htmlContent: docContent });

        const currentVersion = (roomVersions.get(cleanRoomId) || 0) + 1;
        roomVersions.set(cleanRoomId, currentVersion);

        const fullStateBase64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");

        const hostOwner = roomOwners.get(cleanRoomId);

        // 1. Send authoritative document state, canvas sketches, and projected files to newly joined socket
        const sketchMap = roomSketches.get(cleanRoomId);
        const currentSketches = sketchMap ? Object.fromEntries(sketchMap) : {};
        const files = roomProjectedFiles.get(cleanRoomId) || [];
        const latestFile = files.length > 0 ? files[files.length - 1] : null;
        const isReadOnly = currentUser.role === "Viewer" || (roomSetting.access === "readonly" && currentUser.role !== "Host");

        socket.emit("init-document", {
          roomId: cleanRoomId,
          title: docTitle,
          contentHtml: docContent,
          crdtUpdateBase64: fullStateBase64,
          crdtVersion: currentVersion,
          role: currentUser.role,
          isHost: currentUser.role === "Host",
          isReadOnly: isReadOnly,
          access: roomSetting.access,
          defaultRole: roomSetting.defaultRole,
          hostUser: hostOwner || (currentUser.role === "Host" ? currentUser : undefined),
          sketches: currentSketches,
          projectedFiles: files,
          latestProjectedFile: latestFile
        });

        // Backwards compatibility for existing crdtService listeners
        socket.emit("crdt-init", {
          stateBase64: fullStateBase64,
          contentHtml: docContent,
          title: docTitle,
          sketches: currentSketches,
          isReadOnly: isReadOnly,
          projectedFiles: files,
          latestProjectedFile: latestFile
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
          user: currentUser,
          participants: activeParticipants
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
        if (!socket.rooms.has(cleanRoomId)) {
          socket.join(cleanRoomId);
        }

        const isReadOnlyRoom = roomAccessSettings.get(cleanRoomId)?.access === "readonly" || roomAccessSettings.get(cleanRoomId)?.defaultRole === "viewer";
        if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
          socket.emit("permission-denied", {
            action: "edit",
            error: "You are in read-only viewer mode. Only the room host can modify this document."
          });
          return;
        }

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

        // Update in-memory document state immediately, protecting non-placeholder content
        const prevDoc = roomDocs.get(cleanRoomId);
        const isPlaceholderText = (html?: string) => {
          if (!html) return true;
          return html.includes("Connecting to shared workspace...") ||
                 html.includes("Connecting to server...") ||
                 html.includes("Loading collaborative document");
        };

        if (isPlaceholderText(contentHtml) && prevDoc && !isPlaceholderText(prevDoc.htmlContent)) {
          // Reject replacing authoritative doc content with placeholder text
          return;
        }

        roomDocs.set(cleanRoomId, {
          title: title || prevDoc?.title || "Untitled Document",
          htmlContent: contentHtml
        });

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
          title: title || prevDoc?.title || "Untitled Document",
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
        queueSaveDocument(cleanRoomId, title || prevDoc?.title || "", contentHtml, ydoc, senderUser.fullName);
      } catch (err) {
        console.error("[CollabSocket] Error in doc-update:", err);
      }
    });

    // Provide on-demand participant list
    socket.on("get-participants", (data: { roomId: string }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const participants = getDeduplicatedParticipants(clean);
      socket.emit("participants-update", { roomId: clean, participants });
      socket.emit("presence-update", participants);
    });

    // Provide on-demand document sync
    socket.on("request-doc-sync", (data: { roomId: string }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const doc = roomDocs.get(clean);
      const host = roomOwners.get(clean);
      const v = roomVersions.get(clean) || 1;
      const sketchMap = roomSketches.get(clean);
      const currentSketches = sketchMap ? Object.fromEntries(sketchMap) : {};
      if (doc) {
        socket.emit("init-document", {
          roomId: clean,
          title: doc.title,
          contentHtml: doc.htmlContent,
          crdtVersion: v,
          hostUser: host,
          sketches: currentSketches
        });
        socket.emit("doc-update", {
          roomId: clean,
          title: doc.title,
          contentHtml: doc.htmlContent,
          crdtVersion: v,
          sketches: currentSketches
        });
      }
    });

    // Handle crdt-update alias
    socket.on("crdt-update", async (data: any) => {
      const clean = (data?.roomId || "").trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        socket.emit("permission-denied", {
          action: "crdt-update",
          error: "You are in read-only viewer mode. Only the room host can modify this document."
        });
        return;
      }

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
      if (!data?.roomId || !data?.fileRecord) return;
      const clean = data.roomId.trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        socket.emit("permission-denied", {
          action: "project-file",
          error: "You are in read-only viewer mode. Only authorized editors can upload or project files."
        });
        return;
      }

      addRoomProjectedFile(clean, data.fileRecord, false);
      socket.to(clean).emit("project-file", data);
      socket.to(clean).emit("PROJECTED_FILE_SYNC", data);
    });

    // Real-Time Canvas / Sketch Sync
    socket.on("sketch-update", (data: { roomId: string; targetCanvasId: string; dataUrl: string; user?: any }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        socket.emit("permission-denied", {
          action: "sketch",
          error: "You are in read-only viewer mode. Drawing is restricted to authorized editors."
        });
        return;
      }

      if (!roomSketches.has(clean)) {
        roomSketches.set(clean, new Map());
      }
      if (data.targetCanvasId && data.dataUrl) {
        roomSketches.get(clean)!.set(data.targetCanvasId, data.dataUrl);
      }
      socket.to(clean).emit("sketch-update", data);
      socket.to(clean).emit("SKETCH_SYNC", data);
    });

    // Real-Time Live Drawing Stroke Sync (continuous movement)
    socket.on("sketch-live-stroke", (data: {
      roomId: string;
      targetCanvasId: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      tool: string;
      color: string;
      size: number;
      isStart?: boolean;
      isEnd?: boolean;
      user?: any;
    }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        socket.emit("permission-denied", {
          action: "sketch",
          error: "You are in read-only viewer mode. Drawing is restricted to authorized editors."
        });
        return;
      }
      socket.to(clean).emit("sketch-live-stroke", data);
    });

    // Real-Time Canvas Clear
    socket.on("sketch-clear", (data: { roomId: string; targetCanvasId?: string; user?: any }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        socket.emit("permission-denied", {
          action: "sketch",
          error: "You are in read-only viewer mode."
        });
        return;
      }

      if (data.targetCanvasId) {
        roomSketches.get(clean)?.delete(data.targetCanvasId);
      } else {
        roomSketches.delete(clean);
      }
      socket.to(clean).emit("sketch-clear", data);
    });

    // Real-Time Canvas Undo
    socket.on("sketch-undo", (data: { roomId: string; targetCanvasId: string; dataUrl?: string; user?: any }) => {
      if (!data?.roomId) return;
      const clean = data.roomId.trim().toUpperCase();
      const isReadOnlyRoom = roomAccessSettings.get(clean)?.access === "readonly" || roomAccessSettings.get(clean)?.defaultRole === "viewer";
      if (currentUser?.role === "Viewer" || (isReadOnlyRoom && currentUser?.role !== "Host")) {
        return;
      }

      if (!roomSketches.has(clean)) {
        roomSketches.set(clean, new Map());
      }
      if (data.targetCanvasId && data.dataUrl) {
        roomSketches.get(clean)!.set(data.targetCanvasId, data.dataUrl);
      } else if (data.targetCanvasId) {
        roomSketches.get(clean)?.delete(data.targetCanvasId);
      }
      socket.to(clean).emit("sketch-undo", data);
      socket.to(clean).emit("sketch-update", data);
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
