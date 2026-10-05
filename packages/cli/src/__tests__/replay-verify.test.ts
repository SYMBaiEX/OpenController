import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyReplay } from "../commands/replay-verify";

const fixtures = join(import.meta.dir, "fixtures");

describe("replay verify", () => {
  test("verifies timed press and separate release at their logged boundaries", async () => {
    const result = await verifyReplay(
      join(fixtures, "replay-verify-timed.jsonl"),
    );

    expect(result).toEqual({ events: 2, verified: 2, unverifiable: [] });
  });

  test("reports the first differing control field with event and line", async () => {
    const result = await verifyReplay(
      join(fixtures, "replay-verify-mismatch.jsonl"),
    );

    expect(result.mismatch).toEqual({
      event: 1,
      line: 1,
      field: "buttons.A",
    });
    expect(result.verified).toBe(0);
  });

  test("reports malformed JSON with one-based line and event", async () => {
    const input = join(fixtures, "replay-verify-malformed.jsonl");
    const content = await readFile(input, "utf8");
    expect(content).toContain("not-json");
    await expect(verifyReplay(input)).rejects.toThrow(`at line 1 (event 1)`);
  });

  test("marks legacy commands unverifiable rather than inferring missing state", async () => {
    const result = await verifyReplay(
      join(fixtures, "replay-verify-legacy.jsonl"),
    );

    expect(result.verified).toBe(0);
    expect(result.unverifiable).toEqual([
      {
        event: 1,
        line: 1,
        reason: "legacy command is missing stateBefore",
      },
    ]);
  });

  test("reports unsupported profiles, command types, and missing command fields", async () => {
    const result = await verifyReplay(
      join(fixtures, "replay-verify-unsupported.jsonl"),
    );

    expect(result.unverifiable.map(({ reason }) => reason)).toEqual([
      'unsupported command type "future-command"',
      'unsupported or missing profile "arcade"',
      "command is missing required boolean pressed",
    ]);
  });
});
