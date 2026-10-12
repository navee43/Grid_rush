import { createHash, randomBytes } from "node:crypto";
import { PLAYER_COLORS, type PublicUser } from "@gridrush/shared";
import { User, toPublicUser } from "../models/User.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Pick a color that is used by the fewest existing players, breaking ties at
 * random, so early players get clearly different colors.
 */
async function pickColor(): Promise<string> {
  const usage = await User.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$color", n: { $sum: 1 } } }]);
  const counts = new Map(usage.map((u) => [u._id, u.n]));
  const min = Math.min(...PLAYER_COLORS.map((c) => counts.get(c) ?? 0));
  const candidates = PLAYER_COLORS.filter((c) => (counts.get(c) ?? 0) === min);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? PLAYER_COLORS[0];
}

export async function createSession(displayName: string): Promise<{ user: PublicUser; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const color = await pickColor();
  const user = await User.create({ displayName, color, tokenHash: hashToken(token), lastSeenAt: new Date() });
  return { user: toPublicUser(user), token };
}

/** Resolve a bearer token to a user, or null. Never throws on bad input. */
export async function authenticate(token: unknown): Promise<PublicUser | null> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const user = await User.findOne({ tokenHash: hashToken(token) }, { displayName: 1, color: 1 }).lean();
  return user ? toPublicUser(user) : null;
}

export async function touchUser(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
}
