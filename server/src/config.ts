import "dotenv/config";
import { z } from "zod";

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes"].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required").default("mongodb://127.0.0.1:27017/gridrush"),
  /** Comma-separated list of allowed browser origins, e.g. "http://localhost:5173,https://gridrush.vercel.app". */
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Set to the number of proxies in front of the app (Render = 1) so rate limiting sees real client IPs. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Max claim requests per user in the window. */
  CLAIM_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  CLAIM_RATE_WINDOW_MS: z.coerce.number().int().positive().default(5_000),
  /** Max new sessions per IP in the window. */
  SESSION_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SESSION_RATE_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60_000),
  /** General API limit per IP. */
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  API_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_DISABLED: boolish.default(false),
});

export type Config = z.infer<typeof envSchema> & { clientOrigins: string[] };

export function loadConfig(overrides: Partial<Record<keyof z.infer<typeof envSchema>, unknown>> = {}): Config {
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const clientOrigins = parsed.data.CLIENT_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return { ...parsed.data, clientOrigins };
}
