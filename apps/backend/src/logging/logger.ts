import pino, { type Logger as PinoLogger } from "pino";

import type { Env } from "@/config/env";

export type Logger = PinoLogger;

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: "privacy-trash-backend",
      environment: env.NODE_ENV,
    },
  });
}
