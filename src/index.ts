import { handlePreToolUse } from "./handler.ts";
import type { PreToolUseInput } from "./types.ts";

import { createJevClient } from "./jev.ts";

const defaultJevClient = createJevClient();

async function main(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawInput = Buffer.concat(chunks).toString("utf-8").trim();
  if (rawInput.length === 0) {
    const defaultResponse = {
      decision: "force_ask",
      reason: "[YELLOW - REVIEW] Intent: unknown | Detail: Empty hook input stream",
    };
    process.stdout.write(JSON.stringify(defaultResponse) + "\n");
    return;
  }

  try {
    const input = JSON.parse(rawInput) as PreToolUseInput;
    const response = await handlePreToolUse(input, { jevClient: defaultJevClient });
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (error) {
    const fallbackResponse = {
      decision: "force_ask",
      reason: `[YELLOW - REVIEW] Intent: parse_error | Detail: Failed parsing JSON input: ${String(error)}`,
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
