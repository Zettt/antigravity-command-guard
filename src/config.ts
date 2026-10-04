import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PluginConfig {
  apiKey?: string;
  endpointUrl?: string;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_ENDPOINT_URL = "https://api.typesafe.ai/v1/systemone";

export function getPluginConfigPath(): string {
  return join(
    homedir(),
    ".gemini",
    "config",
    "plugins",
    "command-guard",
    "config.json",
  );
}

export function loadPluginConfig(customPath?: string): PluginConfig {
  const filePath = customPath ?? getPluginConfigPath();
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const config: PluginConfig = {};
    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0) {
      config.apiKey = parsed.apiKey.trim();
    }
    const endpoint = parsed.endpointUrl ?? parsed.endpoint;
    if (typeof endpoint === "string" && endpoint.trim().length > 0) {
      config.endpointUrl = endpoint.trim();
    }
    if (typeof parsed.timeoutMs === "number" && !Number.isNaN(parsed.timeoutMs) && parsed.timeoutMs > 0) {
      config.timeoutMs = parsed.timeoutMs;
    }
    return config;
  } catch {
    return {};
  }
}

export interface ResolvedRuntimeConfig {
  apiKey: string;
  endpointUrl: string;
  timeoutMs: number;
}

export function resolveRuntimeConfig(fileConfig?: PluginConfig): ResolvedRuntimeConfig {
  const envKey = process.env.TYPESAFE_API_KEY?.trim();
  const fileKey = fileConfig?.apiKey?.trim();
  const apiKey = envKey && envKey.length > 0 ? envKey : (fileKey ?? "");

  const envEndpoint = process.env.TYPESAFE_API_ENDPOINT?.trim();
  const fileEndpoint = fileConfig?.endpointUrl?.trim();
  let endpointUrl =
    envEndpoint && envEndpoint.length > 0
      ? envEndpoint
      : fileEndpoint && fileEndpoint.length > 0
        ? fileEndpoint
        : DEFAULT_ENDPOINT_URL;

  if (endpointUrl.endsWith("/v1/battery")) {
    endpointUrl = endpointUrl.replace(/\/v1\/battery$/, "/v1/systemone");
  }

  const envTimeoutRaw = process.env.COMMAND_GUARD_TIMEOUT_MS?.trim();
  const envTimeout = envTimeoutRaw ? Number.parseInt(envTimeoutRaw, 10) : undefined;
  const timeoutMs =
    envTimeout && !Number.isNaN(envTimeout) && envTimeout > 0
      ? envTimeout
      : fileConfig?.timeoutMs && fileConfig.timeoutMs > 0
        ? fileConfig.timeoutMs
        : DEFAULT_TIMEOUT_MS;

  return {
    apiKey,
    endpointUrl,
    timeoutMs,
  };
}
