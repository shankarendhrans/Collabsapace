import mongoose, { Schema, Document as MongoDoc } from "mongoose";

export interface IUser extends MongoDoc {
  fullName: string;
  email: string;
  username: string;
  passwordHash: string;
  preferences: {
    theme: "light" | "dark" | "color";
    accentColor: string;
  };
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 40 },
    passwordHash: { type: String, required: true },
    preferences: {
      theme: { type: String, enum: ["light", "dark", "color"], default: "light" },
      accentColor: { type: String, default: "indigo" }
    }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
