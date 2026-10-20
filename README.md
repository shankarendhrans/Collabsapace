# CollabSpace — Real-Time Collaborative Document Editor

**CollabSpace** is a modern, full-stack real-time collaborative document editor built with **React, Vite, TypeScript, Tailwind CSS, TipTap, Yjs (CRDT), Node.js, Express, Socket.IO, and MongoDB**. It enables multiple authenticated users to create rooms, share invitation links, edit rich-text documents simultaneously with conflict-free CRDT merging, import documents (`.txt`, `.md`, `.docx`, `.pdf`, `.rtf`, `.html`), apply formatting and highlights, switch themes (`Light`, `Dark`, `Color`), and export their work (`.txt`, `.md`, `.html`, `.docx`, `.pdf`).

---

## 1. Architecture Overview

```text
User A / User B
      │
      ▼
React Frontend & Rich-Text Editor (Vite + TypeScript + TipTap + Tailwind CSS)
      │
      ▼
Authentication & Room Management API (Express + JWT + bcrypt + Rate Limiter)
      │
      ▼
WebSocket / Socket.IO Communication (Room Channels + Cursor & Presence Broadcast)
      │
      ▼
CRDT Synchronization Engine (Yjs Incremental State Vectors & Conflict-Free Merging)
      │
      ▼
Backend Services & MongoDB Persistence (Users, Rooms, Documents & File Parsers)
```

---

## 2. Project Folder Structure

```text
collabspace/
├── README.md
├── .gitignore
├── .env.example
├── setup.sh
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── server.ts                 # Express + Socket.IO entry point
│       ├── config/
│       │   └── db.ts                 # MongoDB Mongoose connection
│       ├── models/
│       │   ├── User.ts               # User schema (hashed password, preferences)
│       │   ├── Room.ts               # Room schema (owner, members, access settings)
│       │   └── Document.ts           # Document schema (CRDT state, HTML/content, metadata)
│       ├── middleware/
│       │   ├── auth.ts               # JWT verification & room permission checks
│       │   └── rateLimiter.ts        # Rate limiting for auth & file endpoints
│       ├── routes/
│       │   ├── authRoutes.ts         # POST /api/auth/register, /login, /me
│       │   ├── roomRoutes.ts         # POST /api/rooms/create, /join, GET /recent
│       │   └── documentRoutes.ts     # Import & export document conversion endpoints
│       ├── socket/
│       │   └── collabSocket.ts       # Real-time Yjs CRDT incremental sync & presence
│       └── tests/
│           └── collabspace.test.ts   # Automated functional test suite
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── context/
        │   ├── AuthContext.tsx       # JWT session & user persistence
        │   └── ThemeContext.tsx      # Light, Dark & Color theme engine
        ├── services/
        │   ├── api.ts                # Axios/Fetch REST client
        │   ├── crdtService.ts        # Yjs CRDT document & WebSocket provider
        │   └── fileService.ts        # Multi-format Import & Export (.txt, .md, .docx, .pdf, .rtf, .html)
        ├── components/
        │   ├── Navbar.tsx
        │   ├── EditorToolbar.tsx
        │   └── ArchitectureSection.tsx
        └── pages/
            ├── AuthPage.tsx          # Login & Registration with validation
            ├── DashboardPage.tsx     # Create/Join Room, Recent Rooms, Architecture
            └── EditorPage.tsx        # Collaborative Rich-Text & PDF Annotation Workspace
```

---

## 3. Prerequisites & MongoDB Configuration

1. **Node.js**: v18.0.0 or higher (`node -v`)
2. **MongoDB**: Local MongoDB Community Server (`mongodb://127.0.0.1:27017/collabspace`) or a MongoDB Atlas cluster URI.

### Environment Configuration
Copy `.env.example` to `backend/.env` and update the placeholder values:

```bash
cp .env.example backend/.env
```

---

## 4. Installation & Running Locally

### Option A: Quick Setup Script
```bash
chmod +x setup.sh
./setup.sh
```

### Option B: Manual Step-by-Step

1. **Install & Start Backend**:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   The backend API and Socket.IO server will start on `http://localhost:5000`.

2. **Install & Start Frontend**:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

3. **Run Functional Tests**:
   ```bash
   cd backend
   npm test
   ```

---

## 5. PDF Import vs. PDF Annotation Workflow

Because PDFs are fixed-layout binary documents rather than native rich-text flows, CollabSpace provides **two distinct modes** when importing a `.pdf`:
1. **Editable Rich-Text Extraction Mode**: Extracts headings, paragraphs, and lists into the collaborative rich-text editor so multiple users can rewrite, recolor, and reformat the text. Complex multi-column coordinates or vector graphics are noted in an import summary banner.
2. **PDF Layout Annotation Mode**: Preserves the original PDF page structure and allows collaborators to add highlights, sticky notes, and markup callouts directly on top of the document, retaining all annotations upon export.
