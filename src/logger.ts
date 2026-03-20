export type LogLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel = "info") {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (levelWeight[level] < levelWeight[this.level]) {
      return;
    }

    const safeContext = context ? redactSensitive(context) : undefined;
    const payload = safeContext ? ` ${JSON.stringify(safeContext)}` : "";
    process.stdout.write(`[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${payload}\n`);
  }
}

function redactSensitive(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(redactSensitive);
  }
  if (!input || typeof input !== "object") {
    return input;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("authorization") || normalized.includes("cookie") || normalized.includes("token")) {
      output[key] = "<redacted>";
      continue;
    }
    output[key] = redactSensitive(value);
  }
  return output;
}
