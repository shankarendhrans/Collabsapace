import React from "react";

export const ARCHITECTURE_STEPS = [
  {
    step: "1",
    title: "User A / User B (Multi-Session Clients)",
    subtitle: "Authenticated Collaborators",
    desc: "Multiple users connect simultaneously from desktop or mobile browsers with live presence avatars and remote cursor tracking."
  },
  {
    step: "2",
    title: "React Frontend & Rich-Text Editor",
    subtitle: "Vite + TypeScript + TipTap",
    desc: "Provides a responsive document workspace with rich formatting, color/highlight palettes, file import/export, and Light/Dark/Color themes."
  },
  {
    step: "3",
    title: "Authentication & Room Management API",
    subtitle: "Express + JWT + bcrypt + RBAC",
    desc: "Verifies user credentials with salted password hashes, issues JWT tokens, and enforces room ownership and member permissions."
  },
  {
    step: "4",
    title: "WebSocket / Socket.IO Communication",
    subtitle: "Low-Latency Full-Duplex Channels",
    desc: "Broadcasts incremental document updates, collaborator join/leave events, and live cursor coordinates in real time."
  },
  {
    step: "5",
    title: "CRDT Synchronization Engine",
    subtitle: "Yjs Conflict-Free Replicated Data Types",
    desc: "Merges concurrent character and formatting operations deterministically without locks so users never overwrite each other's work."
  },
  {
    step: "6",
    title: "Backend Services & MongoDB Persistence",
    subtitle: "Mongoose Models & File Conversion Pipeline",
    desc: "Persists users, room metadata, and encoded CRDT document states in MongoDB while handling DOCX, PDF, Markdown, RTF, and HTML conversions."
  }
];
