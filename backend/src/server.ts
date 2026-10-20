import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { Server as SocketIOServer } from "socket.io";
import { connectDatabase } from "./config/db";
import authRoutes from "./routes/authRoutes";
import roomRoutes from "./routes/roomRoutes";
import documentRoutes from "./routes/documentRoutes";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { setupCollabSocket } from "./socket/collabSocket";

dotenv.config();

const app = express();
const server = http.createServer(app);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const io = new SocketIOServer(server, {
  cors: {
    origin: clientOrigin,
    methods: ["GET", "POST"]
  }
});

app.use(helmet());
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/api", apiRateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/documents", documentRoutes);

setupCollabSocket(io);

const PORT = Number(process.env.PORT) || 5000;
connectDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`[CollabSpace] Server listening on http://localhost:${PORT}`);
  });
});
