import { existsSync, promises as fs } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { AuditLogEntry } from "./types.ts";

export const DEFAULT_LOG_PATH = "logs/audit.jsonl";
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export interface WriteAuditLogOptions {
  logPath?: string;
  maxBytes?: number;
}

async function rotateLogFile(logPath: string): Promise<void> {
  const dir = dirname(logPath);
  const ext = extname(logPath);
  const base = basename(logPath, ext);

  let maxIndex = 1;
  while (existsSync(join(dir, `${base}.${maxIndex}${ext}`))) {
    maxIndex++;
  }

  for (let i = maxIndex - 1; i >= 1; i--) {
    const src = join(dir, `${base}.${i}${ext}`);
    const dest = join(dir, `${base}.${i + 1}${ext}`);
    await fs.rename(src, dest);
  }

  const dest1 = join(dir, `${base}.1${ext}`);
  await fs.rename(logPath, dest1);
}

export async function writeAuditLog(
  entry: AuditLogEntry,
  options?: WriteAuditLogOptions,
): Promise<void> {
  const logPath = options?.logPath ?? DEFAULT_LOG_PATH;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const dir = dirname(logPath);

  if (dir && dir !== ".") {
    await fs.mkdir(dir, { recursive: true });
  }

  try {
    const stats = await fs.stat(logPath);
    if (stats.size >= maxBytes && stats.size > 0) {
      await rotateLogFile(logPath);
    }
  } catch (error: unknown) {
    const nodeError = error as { code?: string };
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(logPath, line, "utf-8");
}
