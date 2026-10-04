import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_ENDPOINT_URL,
  DEFAULT_TIMEOUT_MS,
  loadPluginConfig,
  resolveRuntimeConfig,
} from "../src/config.ts";

describe("Plugin Configuration", () => {
  const originalEnv = { ...process.env };
  const tempDir = join(tmpdir(), `guard-cfg-test-${Date.now()}`);
  const tempConfigPath = join(tempDir, "config.json");

  beforeEach(() => {
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_ENDPOINT;
    delete process.env.COMMAND_GUARD_TIMEOUT_MS;
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch {}
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    try {
      unlinkSync(tempConfigPath);
    } catch {}
    try {
      rmdirSync(tempDir);
    } catch {}
  });

  it("returns default values when file does not exist and no env vars set", () => {
    const fileConfig = loadPluginConfig("/nonexistent/path/config.json");
    expect(fileConfig).toEqual({});

    const runtime = resolveRuntimeConfig(fileConfig);
    expect(runtime.apiKey).toBe("");
    expect(runtime.endpointUrl).toBe(DEFAULT_ENDPOINT_URL);
    expect(runtime.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("loads apiKey, endpointUrl, and timeoutMs from config.json", () => {
    writeFileSync(
      tempConfigPath,
      JSON.stringify({
        apiKey: "test-file-key",
        endpointUrl: "https://custom.endpoint.ai/v1/systemone",
        timeoutMs: 4500,
      }),
      "utf-8",
    );

    const fileConfig = loadPluginConfig(tempConfigPath);
    expect(fileConfig.apiKey).toBe("test-file-key");
    expect(fileConfig.endpointUrl).toBe("https://custom.endpoint.ai/v1/systemone");
    expect(fileConfig.timeoutMs).toBe(4500);

    const runtime = resolveRuntimeConfig(fileConfig);
    expect(runtime.apiKey).toBe("test-file-key");
    expect(runtime.endpointUrl).toBe("https://custom.endpoint.ai/v1/systemone");
    expect(runtime.timeoutMs).toBe(4500);
  });

  it("gives precedence to environment variables over config.json", () => {
    writeFileSync(
      tempConfigPath,
      JSON.stringify({
        apiKey: "file-key",
        endpointUrl: "https://file-endpoint.ai",
        timeoutMs: 5000,
      }),
      "utf-8",
    );

    process.env.TYPESAFE_API_KEY = "env-key";
    process.env.TYPESAFE_API_ENDPOINT = "https://env-endpoint.ai/v1/systemone";
    process.env.COMMAND_GUARD_TIMEOUT_MS = "2000";

    const fileConfig = loadPluginConfig(tempConfigPath);
    const runtime = resolveRuntimeConfig(fileConfig);

    expect(runtime.apiKey).toBe("env-key");
    expect(runtime.endpointUrl).toBe("https://env-endpoint.ai/v1/systemone");
    expect(runtime.timeoutMs).toBe(2000);
  });
});
