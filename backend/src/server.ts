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
const rawOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = rawOrigin.split(",").map(o => o.trim()).filter(Boolean);

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith(".vercel.app") || origin.includes("localhost") || origin.includes("127.0.0.1")) return true;
  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in production for client collaboration
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
};

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(helmet());
app.use(cors(corsOptions));
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
