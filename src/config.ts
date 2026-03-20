import { z } from "zod";

const configSchema = z.object({
  CALDAV_BASE_URL: z.string().url(),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ALLOW_COOKIE_PASSTHROUGH: z.preprocess((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      return value === "true";
    }
    return false;
  }, z.boolean().default(false)),
  CALDAV_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CALDAV_RETRY_COUNT: z.coerce.number().int().min(0).max(5).default(1),
  EVENT_HREF_STRATEGY: z.enum(["uid"]).default("uid"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
