import mongoose, { Schema, Document as MongoDoc } from "mongoose";

export interface IRoom extends MongoDoc {
  roomId: string;
  name: string;
  description: string;
  ownerId: mongoose.Types.ObjectId;
  authorizedMembers: Array<{
    userId: mongoose.Types.ObjectId;
    role: "owner" | "editor" | "viewer";
    joinedAt: Date;
  }>;
  accessSettings: {
    allowLinkJoin: boolean;
    defaultRole: "editor" | "viewer";
  };
  hiddenForUsers?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorizedMembers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
        joinedAt: { type: Date, default: Date.now }
      }
    ],
    accessSettings: {
      allowLinkJoin: { type: Boolean, default: true },
      defaultRole: { type: String, enum: ["editor", "viewer"], default: "editor" }
    },
    hiddenForUsers: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }]
  },
  { timestamps: true }
);

export const RoomModel = mongoose.model<IRoom>("Room", RoomSchema);
