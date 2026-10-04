import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { exportReplay } from "../commands/replay-export";

describe("replay export", () => {
  test("streams JSON arrays and preserves unrecognized event fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const output = join(directory, "events.json");
    const events = [
      {
        type: "command",
        timestamp: 42,
        controllerId: "pad-1",
        command: { type: "button", button: "a" },
        futureField: { preserved: true },
      },
      { type: "annotation", timestamp: 43, label: "checkpoint" },
    ];

    try {
      await writeFile(
        input,
        `${events.map(JSON.stringify).join("\r\n")}\r\n\r\n`,
      );
      await exportReplay(input, { format: "json", output });
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual(events);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("exports an empty replay as an empty JSON array", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const output = join(directory, "events.json");

    try {
      await writeFile(input, "");
      await exportReplay(input, { format: "json", output });
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("writes stable CSV columns and quotes commas, quotes, and newlines", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const output = join(directory, "events.csv");
    const event = {
      timestamp: 42,
      type: "annotation",
      label: 'review, "this"\nnow',
      data: { note: "preserved" },
    };

    try {
      await writeFile(input, `${JSON.stringify(event)}\n`);
      await exportReplay(input, { format: "csv", output });
      const csv = await readFile(output, "utf8");
      expect(csv.split("\n", 1)[0]).toBe(
        "timestamp,type,controllerId,profile,label,command,stateBefore,stateAfter,state,feedback,error,intent,source,data,event_json",
      );
      expect(csv).toContain('"review, ""this""\nnow"');
      expect(csv).toContain('"{""note"":""preserved""}"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("reports malformed JSON with path and one-based line number", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    try {
      await writeFile(input, "{}\nnot-json\n");
      await expect(
        exportReplay(input, { format: "json", output: "-" }, stdout),
      ).rejects.toThrow(`Invalid JSON in replay file ${input} at line 2`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
