import { describe, expect, test } from "bun:test";
import {
  link,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

  test("rejects symlink and hardlink aliases without truncating the replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const hardLink = join(directory, "hard-link.jsonl");
    const symbolicLink = join(directory, "symbolic-link.jsonl");
    const content = '{"type":"annotation","timestamp":1,"label":"keep"}\n';

    try {
      await writeFile(input, content);
      await link(input, hardLink);
      let supportsSymlinks = true;
      try {
        await symlink(input, symbolicLink);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          !["EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EPERM"].includes(
            code ?? "",
          )
        ) {
          throw error;
        }
        supportsSymlinks = false;
      }

      await expect(
        exportReplay(input, { format: "json", output: hardLink }),
      ).rejects.toThrow("input and output paths must be different");
      if (supportsSymlinks) {
        await expect(
          exportReplay(input, { format: "json", output: symbolicLink }),
        ).rejects.toThrow("input and output paths must be different");
      }
      expect(await readFile(input, "utf8")).toBe(content);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("missing input leaves an existing destination unchanged", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "missing.jsonl");
    const output = join(directory, "existing.json");
    const original = "keep existing destination\n";

    try {
      await writeFile(output, original);
      await expect(
        exportReplay(input, { format: "json", output }),
      ).rejects.toThrow();
      expect(await readFile(output, "utf8")).toBe(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("escapes spreadsheet formula-like CSV cells and preserves original events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencontroller-replay-"));
    const input = join(directory, "events.jsonl");
    const output = join(directory, "events.csv");
    const event = {
      type: "annotation",
      timestamp: -42,
      label: " \t=1+1",
      source: "\u0001@SUM(A1:A2)",
      profile: "+cmd|' /C calc'!A0",
    };

    try {
      await writeFile(input, `${JSON.stringify(event)}\n`);
      await exportReplay(input, { format: "csv", output });
      const [header, row] = (await readFile(output, "utf8")).split("\n");
      const columns = parseCsvLine(header ?? "");
      const values = parseCsvLine(row ?? "");
      const cell = (column: string) => values[columns.indexOf(column)];

      expect(cell("timestamp")).toBe("'-42");
      expect(cell("label")).toBe("' \t=1+1");
      expect(cell("source")).toBe("'\u0001@SUM(A1:A2)");
      expect(cell("profile")).toBe("'+cmd|' /C calc'!A0");
      expect(JSON.parse(cell("event_json") ?? "null")).toEqual(event);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}
