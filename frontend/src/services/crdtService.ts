import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

export interface CollaboratorPresence {
  userId: string;
  fullName: string;
  username: string;
  role: 'Host' | 'Collaborator';
  color: string;
  cursorPos?: number;
  status: 'online' | 'idle';
}

export class CollabCRDTProvider {
  public ydoc: Y.Doc;
  public ytext: Y.Text;
  public socket: Socket;
  private roomId: string;
  private user?: { id?: string; userId?: string; fullName: string; username?: string };

  constructor(
    roomId: string,
    token: string,
    user: { id?: string; userId?: string; fullName: string; username?: string } | null,
    onContentSync: (html: string, title?: string) => void,
    onCollaboratorsChange: (users: CollaboratorPresence[]) => void,
    onConnectionChange: (state: 'Connected' | 'Reconnecting' | 'Offline') => void,
    onTitleSync?: (title: string) => void
  ) {
    this.roomId = roomId;
    this.user = user || undefined;
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('content');

    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (isLocal ? 'http://localhost:5000' : 'https://collabsapace-backend.onrender.com');
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      onConnectionChange('Connected');
      this.socket.emit('join-room', {
        roomId: this.roomId,
        token,
        user: this.user
      });
    });

    this.socket.on('reconnect_attempt', () => {
      onConnectionChange('Reconnecting');
    });

    this.socket.on('reconnect', () => {
      onConnectionChange('Connected');
      this.socket.emit('join-room', {
        roomId: this.roomId,
        token,
        user: this.user
      });
    });

    this.socket.on('disconnect', () => {
      onConnectionChange('Offline');
    });

    // Authoritative Initial Document State
    this.socket.on('init-document', (payload: {
      contentHtml: string;
      title?: string;
      crdtUpdateBase64?: string;
      role?: 'Host' | 'Collaborator';
      isHost?: boolean;
    }) => {
      if (payload.crdtUpdateBase64) {
        try {
          const binary = Uint8Array.from(atob(payload.crdtUpdateBase64), (c) => c.charCodeAt(0));
          Y.applyUpdate(this.ydoc, binary);
        } catch {}
      }
      if (payload.title && onTitleSync) {
        onTitleSync(payload.title);
      }
      if (payload.contentHtml) {
        onContentSync(payload.contentHtml, payload.title);
      }
    });

    // Real-Time Document Synchronization from Host or Participant
    this.socket.on('doc-update', (payload: {
      contentHtml: string;
      title?: string;
      updateBase64?: string;
      userName?: string;
    }) => {
      if (payload.updateBase64) {
        try {
          const binary = Uint8Array.from(atob(payload.updateBase64), (c) => c.charCodeAt(0));
          Y.applyUpdate(this.ydoc, binary);
        } catch {}
      }
      if (payload.title && onTitleSync) {
        onTitleSync(payload.title);
      }
      if (payload.contentHtml !== undefined) {
        onContentSync(payload.contentHtml, payload.title);
      }
    });

    // Full, deduplicated participant list update
    this.socket.on('participants-update', (payload: { roomId: string; participants: CollaboratorPresence[] }) => {
      if (payload?.participants) {
        onCollaboratorsChange(payload.participants);
      }
    });

    this.socket.on('presence-update', (users: CollaboratorPresence[]) => {
      if (Array.isArray(users)) {
        onCollaboratorsChange(users);
      }
    });
  }

  public broadcastUpdate(contentHtml: string, title?: string) {
    let updateBase64 = '';
    try {
      const stateVector = Y.encodeStateAsUpdate(this.ydoc);
      let binaryStr = '';
      stateVector.forEach((b) => (binaryStr += String.fromCharCode(b)));
      updateBase64 = btoa(binaryStr);
    } catch {}

    const payload = {
      roomId: this.roomId,
      updateBase64,
      contentHtml,
      title,
      user: this.user
    };

    this.socket.emit('doc-update', payload);
  }

  public updateCursor(cursorPos: number) {
    this.socket.emit('cursor-move', { roomId: this.roomId, cursorPos, user: this.user });
  }

  public destroy() {
    this.socket.emit('leave-room', { roomId: this.roomId });
    this.socket.disconnect();
    this.ydoc.destroy();
  }
}
