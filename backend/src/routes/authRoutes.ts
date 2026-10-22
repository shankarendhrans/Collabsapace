import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/register", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { fullName, email, username, password, confirmPassword } = req.body;
    if (!fullName || !email || !username || !password) {
      res.status(400).json({ error: "All fields (fullName, email, username, password) are required." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters long." });
      return;
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim();
    const existingUser = await UserModel.findOne({
      $or: [
        { email: cleanEmail },
        { username: cleanUsername },
        { username: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") }
      ]
    });
    if (existingUser) {
      res.status(409).json({ error: "An account with that email or username already exists." });
      return;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await UserModel.create({
      fullName: fullName.trim(),
      email: cleanEmail,
      username: cleanUsername,
      passwordHash
    });

    const secret = process.env.JWT_SECRET || "dev_fallback_secret_do_not_use_in_prod";
    const token = jwt.sign(
      { userId: newUser._id.toString(), email: newUser.email, fullName: newUser.fullName, username: newUser.username },
      secret,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        username: newUser.username,
        preferences: newUser.preferences
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Unable to complete registration at this time." });
  }
});

router.post("/login", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { identifier, password, rememberMe } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ error: "Email/username and password are required." });
      return;
    }

    const cleanId = identifier.trim();
    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await UserModel.findOne({
      $or: [
        { email: cleanId.toLowerCase() },
        { username: cleanId.toLowerCase() },
        { username: new RegExp(`^${escaped}$`, "i") }
      ]
    });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials. Please check your email/username and password." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials. Please check your email/username and password." });
      return;
    }

    const secret = process.env.JWT_SECRET || "dev_fallback_secret_do_not_use_in_prod";
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, fullName: user.fullName, username: user.username },
      secret,
      { expiresIn: rememberMe ? "30d" : "24h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        preferences: user.preferences
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed due to a server error." });
  }
});

router.post("/reset-password", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { identifier, newPassword } = req.body;
    if (!identifier || !newPassword) {
      res.status(400).json({ error: "Email/username and new password are required." });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters long." });
      return;
    }
    const cleanId = identifier.trim();
    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await UserModel.findOne({
      $or: [
        { email: cleanId.toLowerCase() },
        { username: cleanId.toLowerCase() },
        { username: new RegExp(`^${escaped}$`, "i") }
      ]
    });
    if (!user) {
      res.status(404).json({ error: "No account found with that email or username." });
      return;
    }
    const salt = await bcrypt.genSalt(12);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({ message: "Password updated successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: "Unable to reset password at this time." });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.user?.userId).select("-passwordHash");
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

export default router;
