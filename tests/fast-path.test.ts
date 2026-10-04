import { describe, expect, it } from "bun:test";
import { isFastPathAllowed } from "../src/fast-path.ts";

describe("isFastPathAllowed", () => {
  it("allows read-only git queries", () => {
    expect(isFastPathAllowed("git status")).toBe(true);
    expect(isFastPathAllowed("git status -s")).toBe(true);
    expect(isFastPathAllowed("git diff")).toBe(true);
    expect(isFastPathAllowed("git diff HEAD~1")).toBe(true);
    expect(isFastPathAllowed("git log -n 5")).toBe(true);
    expect(isFastPathAllowed("git branch -a")).toBe(true);
  });

  it("allows standard read-only utilities", () => {
    expect(isFastPathAllowed("ls")).toBe(true);
    expect(isFastPathAllowed("ls -la")).toBe(true);
    expect(isFastPathAllowed("pwd")).toBe(true);
    expect(isFastPathAllowed("cat README.md")).toBe(true);
    expect(isFastPathAllowed("head -n 10 file.txt")).toBe(true);
    expect(isFastPathAllowed("tail -n 20 file.txt")).toBe(true);
    expect(isFastPathAllowed("wc -l file.txt")).toBe(true);
    expect(isFastPathAllowed("fd -t f foo")).toBe(true);
    expect(isFastPathAllowed("rg 'pattern' src/")).toBe(true);
    expect(isFastPathAllowed("which bun")).toBe(true);
  });

  it("allows version queries across common binaries", () => {
    expect(isFastPathAllowed("node -v")).toBe(true);
    expect(isFastPathAllowed("bun --version")).toBe(true);
    expect(isFastPathAllowed("python -V")).toBe(true);
    expect(isFastPathAllowed("git --version")).toBe(true);
  });

  it("allows safe dev test and build runners", () => {
    expect(isFastPathAllowed("bun test")).toBe(true);
    expect(isFastPathAllowed("bun test tests/foo.test.ts")).toBe(true);
    expect(isFastPathAllowed("npm test")).toBe(true);
    expect(isFastPathAllowed("npm run lint")).toBe(true);
    expect(isFastPathAllowed("npm run typecheck")).toBe(true);
    expect(isFastPathAllowed("tsc --noEmit")).toBe(true);
    expect(isFastPathAllowed("npx tsc --noEmit")).toBe(true);
    expect(isFastPathAllowed("pytest")).toBe(true);
    expect(isFastPathAllowed("uv run pytest tests/")).toBe(true);
    expect(isFastPathAllowed("cargo test")).toBe(true);
    expect(isFastPathAllowed("cargo check")).toBe(true);
    expect(isFastPathAllowed("go test ./...")).toBe(true);
  });

  it("allows rtk prefixed read-only commands", () => {
    expect(isFastPathAllowed("rtk ls")).toBe(true);
    expect(isFastPathAllowed("rtk fd foo")).toBe(true);
    expect(isFastPathAllowed("rtk rg pattern")).toBe(true);
    expect(isFastPathAllowed("rtk git status")).toBe(true);
  });

  it("rejects mutating commands from fast-path", () => {
    expect(isFastPathAllowed("rm file.txt")).toBe(false);
    expect(isFastPathAllowed("rm -rf node_modules")).toBe(false);
    expect(isFastPathAllowed("git push origin main")).toBe(false);
    expect(isFastPathAllowed("git commit -m 'fix'")).toBe(false);
    expect(isFastPathAllowed("touch new-file.txt")).toBe(false);
    expect(isFastPathAllowed("npm install")).toBe(false);
    expect(isFastPathAllowed("bun add zod")).toBe(false);
  });

  it("rejects redirection and process substitution from fast-path", () => {
    expect(isFastPathAllowed("cat a.txt > ~/b.txt")).toBe(false);
    expect(isFastPathAllowed("cat a.txt >> b.txt")).toBe(false);
    expect(isFastPathAllowed("cat a.txt>b.txt")).toBe(false);
    expect(isFastPathAllowed("cat < a.txt")).toBe(false);
    expect(isFastPathAllowed("cat <(ls)")).toBe(false);
    expect(isFastPathAllowed("ls\nrm x")).toBe(false);
    expect(isFastPathAllowed("ls | tee out.txt")).toBe(false);
  });

  it("rejects empty or whitespace-only strings", () => {
    expect(isFastPathAllowed("")).toBe(false);
    expect(isFastPathAllowed("   ")).toBe(false);
  });
});
