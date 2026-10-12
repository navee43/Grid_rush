import mongoose from "mongoose";
import type { Logger } from "../logger.js";

export async function connectDatabase(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  // Indexes are created explicitly in ensureBoard/ensureIndexes so startup order is predictable.
  mongoose.set("autoIndex", false);

  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  mongoose.connection.on("error", (err) => logger.error({ err }, "MongoDB connection error"));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, "Connected to MongoDB");
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
