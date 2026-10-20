import mongoose from "mongoose";
import dns from "dns";

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
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log("[MongoDB] Connected to database successfully");
  } catch (err: any) {
    console.error("[MongoDB] Connection failed:", err?.message || err);
    console.error("[MongoDB] Hint: Please check MONGODB_URI in backend/.env, confirm credentials, and ensure Network Access (IP whitelist 0.0.0.0/0) is enabled in MongoDB Atlas.");
    process.exit(1);
  }
}
