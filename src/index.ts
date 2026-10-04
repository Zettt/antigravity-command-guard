import { handlePreToolUse } from "./handler.ts";
import type { PreToolUseInput } from "./types.ts";
import { createJevClient } from "./jev.ts";
import { loadPluginConfig, resolveRuntimeConfig } from "./config.ts";

const pluginConfig = loadPluginConfig();
const runtimeConfig = resolveRuntimeConfig(pluginConfig);

const defaultJevClient = createJevClient({
  apiKey: runtimeConfig.apiKey,
  endpoint: runtimeConfig.endpointUrl,
});

async function main(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawInput = Buffer.concat(chunks).toString("utf-8").trim();
  if (rawInput.length === 0) {
    const defaultResponse = {
      decision: "force_ask",
      reason: "Needs review: Empty hook input stream [YELLOW - REVIEW] (intent: unknown)",
    };
    process.stdout.write(JSON.stringify(defaultResponse) + "\n");
    return;
  }

  try {
    const input = JSON.parse(rawInput) as PreToolUseInput;
    const response = await handlePreToolUse(input, {
      jevClient: defaultJevClient,
      timeoutMs: runtimeConfig.timeoutMs,
    });
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (error) {
    const fallbackResponse = {
      decision: "force_ask",
      reason: `Needs review: Failed parsing JSON input: ${String(error)} [YELLOW - REVIEW] (intent: parse_error)`,
    };
    process.stdout.write(JSON.stringify(fallbackResponse) + "\n");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`Fatal command guard error: ${String(error)}\n`);
    process.exit(1);
  });
}
