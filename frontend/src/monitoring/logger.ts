type LogLevel = "verbose" | "debug" | "info" | "warn" | "error";

// Lower numbers represent more detailed logging. Higher numbers are more severe.
const LEVELS: Record<LogLevel, number> = {
  verbose: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const envLevel = (process.env.NEXT_PUBLIC_LOG_LEVEL || "info").toLowerCase();
const CURRENT_LEVEL = LEVELS[(envLevel as LogLevel) || "info"] ?? LEVELS.info;

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= CURRENT_LEVEL;
}

export function logVerbose(message: string, ...args: unknown[]): void {
  if (shouldLog("verbose")) {
    console.debug(`[Metrics] ${message}`, ...args);
  }
}

export function logDebug(message: string, ...args: unknown[]): void {
  if (shouldLog("debug")) {
    console.debug(`[Metrics] ${message}`, ...args);
  }
}

export function logMetric(message: string, ...args: unknown[]): void {
  if (shouldLog("info")) {
    console.log(`[Metrics] ${message}`, ...args);
  }
}

export function logWarn(message: string, ...args: unknown[]): void {
  if (shouldLog("warn")) {
    console.warn(`[Metrics] ${message}`, ...args);
  }
}

export function logError(message: string, ...args: unknown[]): void {
  if (shouldLog("error")) {
    console.error(`[Metrics] ${message}`, ...args);
  }
}
