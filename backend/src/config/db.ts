import mongoose from "mongoose";
import dns from "dns";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User";

// Fix Node.js Windows querySrv ECONNREFUSED on local router DNS
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore if custom DNS cannot be set
}

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/collabspace";
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
  console.log(`[MongoDB] Connecting to database: ${maskedUri}`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("[MongoDB] Connected to database successfully");

    // Auto-seed default demo account if it doesn't exist
    try {
      const demoExists = await UserModel.findOne({ email: "demo@collabspace.io" });
      if (!demoExists) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash("CollabSpace123", salt);
        await UserModel.create({
          fullName: "Demo Student",
          email: "demo@collabspace.io",
          username: "demouser",
          passwordHash
        });
        console.log("[MongoDB] Default demo user created: demo@collabspace.io / CollabSpace123");
      }
    } catch (seedErr) {
      console.warn("[MongoDB] Notice: Demo user check skipped:", seedErr);
    }
  } catch (err: any) {
    console.error("[MongoDB] Connection failed:", err?.message || err);
    console.error("[MongoDB] Hint: Check MONGODB_URI in backend/.env, confirm credentials, and ensure Network Access (IP whitelist 0.0.0.0/0) is enabled in MongoDB Atlas.");
    // In production (Render/Cloud), do not crash process immediately so Socket server can still serve clients
    if (process.env.NODE_ENV === "development") {
      console.warn("[MongoDB] Running in fallback mode without persistence until Atlas connects.");
    }
  }
}
