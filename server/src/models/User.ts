import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import type { PublicUser } from "@gridrush/shared";

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 24 },
    color: { type: String, required: true },
    /** SHA-256 of the session token. The raw token is only ever held by the client. */
    tokenHash: { type: String, required: true, select: false },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

userSchema.index({ tokenHash: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId; createdAt: Date };

export const User = model("User", userSchema);

export function toPublicUser(user: Pick<UserDoc, "_id" | "displayName" | "color">): PublicUser {
  return { id: user._id.toString(), displayName: user.displayName, color: user.color };
}
