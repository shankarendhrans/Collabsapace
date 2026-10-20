import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    fullName: string;
    username: string;
  };
  file?: Express.Multer.File;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required. Please log in." });
    return;
  }
  const token = header.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET || "dev_fallback_secret_do_not_use_in_prod";
    const decoded = jwt.verify(token, secret) as AuthRequest["user"];
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session token. Please log in again." });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const secret = process.env.JWT_SECRET || "dev_fallback_secret_do_not_use_in_prod";
      const decoded = jwt.verify(token, secret) as AuthRequest["user"];
      req.user = decoded;
    } catch {}
  }
  next();
}

