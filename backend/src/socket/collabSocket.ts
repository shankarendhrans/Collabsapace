import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import { DocumentModel } from "../models/Document";

const roomYDocs = new Map<string, Y.Doc>();

export function setupCollabSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("join-room", async ({ roomId, user }) => {
      socket.join(roomId);

      let ydoc = roomYDocs.get(roomId);
      if (!ydoc) {
        ydoc = new Y.Doc();
        const dbDoc = await DocumentModel.findOne({ roomId });
        if (dbDoc && dbDoc.crdtStateBase64) {
          const buf = Buffer.from(dbDoc.crdtStateBase64, "base64");
          Y.applyUpdate(ydoc, new Uint8Array(buf));
        }
        roomYDocs.set(roomId, ydoc);
      }

      const fullState = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
      socket.emit("crdt-init", { stateBase64: fullState });

      socket.to(roomId).emit("collaborator-joined", {
        socketId: socket.id,
        user
      });
    });

    socket.on("crdt-update", async ({ roomId, updateBase64, htmlSnapshot, user }) => {
      const ydoc = roomYDocs.get(roomId);
      if (ydoc && updateBase64) {
        const update = new Uint8Array(Buffer.from(updateBase64, "base64"));
        Y.applyUpdate(ydoc, update);

        socket.to(roomId).emit("crdt-update", {
          updateBase64,
          htmlSnapshot,
          user
        });

        const mergedBase64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
        await DocumentModel.findOneAndUpdate(
          { roomId },
          {
            crdtStateBase64: mergedBase64,
            ...(htmlSnapshot ? { htmlContent: htmlSnapshot } : {}),
            "metadata.lastEditedBy": user?.fullName || "Collaborator"
          }
        );
      }
    });

    socket.on("cursor-move", ({ roomId, cursor }) => {
      socket.to(roomId).emit("cursor-move", {
        socketId: socket.id,
        cursor
      });
    });

    socket.on("disconnecting", () => {
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          socket.to(roomId).emit("collaborator-left", { socketId: socket.id });
        }
      }
    });
  });
}
