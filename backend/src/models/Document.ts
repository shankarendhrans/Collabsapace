import mongoose, { Schema, Document as MongoDoc } from "mongoose";

export interface IDocument extends MongoDoc {
  roomId: string;
  title: string;
  htmlContent: string;
  crdtStateBase64: string;
  originalImportedFile?: {
    filename: string;
    mimeType: string;
    rawContent: string;
    importedAt: Date;
  };
  pdfAnnotations: Array<{
    id: string;
    author: string;
    quote: string;
    note: string;
    color: string;
    createdAt: Date;
  }>;
  metadata: {
    wordCount: number;
    charCount: number;
    lastEditedBy: string;
  };
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, default: "Untitled Document", maxlength: 200 },
    htmlContent: { type: String, default: "<p>Welcome to CollabSpace! Start typing collaboratively...</p>" },
    crdtStateBase64: { type: String, default: "" },
    originalImportedFile: {
      filename: String,
      mimeType: String,
      rawContent: String,
      importedAt: Date
    },
    pdfAnnotations: [
      {
        id: String,
        author: String,
        quote: String,
        note: String,
        color: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    metadata: {
      wordCount: { type: Number, default: 0 },
      charCount: { type: Number, default: 0 },
      lastEditedBy: { type: String, default: "System" }
    }
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.model<IDocument>("Document", DocumentSchema);
