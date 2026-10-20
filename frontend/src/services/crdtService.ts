import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

export interface CollaboratorPresence {
  userId: string;
  fullName: string;
  color: string;
  cursorPos?: number;
  status: 'online' | 'idle';
}

export class CollabCRDTProvider {
  public ydoc: Y.Doc;
  public ytext: Y.Text;
  public socket: Socket;
  private roomId: string;

  constructor(
    roomId: string,
    token: string,
    onContentSync: (html: string) => void,
    onCollaboratorsChange: (users: CollaboratorPresence[]) => void,
    onConnectionChange: (state: 'Connected' | 'Reconnecting' | 'Offline') => void
  ) {
    this.roomId = roomId;
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('content');

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    this.socket = io(socketUrl, {
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      onConnectionChange('Connected');
      this.socket.emit('join-room', { roomId });
    });

    this.socket.on('reconnect_attempt', () => {
      onConnectionChange('Reconnecting');
    });

    this.socket.on('disconnect', () => {
      onConnectionChange('Offline');
    });

    this.socket.on('init-document', (payload: { contentHtml: string; crdtUpdateBase64?: string }) => {
      if (payload.crdtUpdateBase64) {
        const binary = Uint8Array.from(atob(payload.crdtUpdateBase64), (c) => c.charCodeAt(0));
        Y.applyUpdate(this.ydoc, binary);
      }
      onContentSync(payload.contentHtml);
    });

    this.socket.on('crdt-update', (payload: { updateBase64: string; contentHtml: string }) => {
      if (payload.updateBase64) {
        const binary = Uint8Array.from(atob(payload.updateBase64), (c) => c.charCodeAt(0));
        Y.applyUpdate(this.ydoc, binary);
      }
      onContentSync(payload.contentHtml);
    });

    this.socket.on('presence-update', (users: CollaboratorPresence[]) => {
      onCollaboratorsChange(users);
    });
  }

  public broadcastUpdate(contentHtml: string, title?: string) {
    const stateVector = Y.encodeStateAsUpdate(this.ydoc);
    let binaryStr = '';
    stateVector.forEach((b) => (binaryStr += String.fromCharCode(b)));
    const updateBase64 = btoa(binaryStr);

    this.socket.emit('crdt-update', {
      roomId: this.roomId,
      updateBase64,
      contentHtml,
      title,
    });
  }

  public updateCursor(cursorPos: number) {
    this.socket.emit('cursor-move', { roomId: this.roomId, cursorPos });
  }

  public destroy() {
    this.socket.emit('leave-room', { roomId: this.roomId });
    this.socket.disconnect();
    this.ydoc.destroy();
  }
}
