import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";

export type ReplayExportFormat = "json" | "csv";

const csvColumns = [
  "timestamp",
  "type",
  "controllerId",
  "profile",
  "label",
  "command",
  "stateBefore",
  "stateAfter",
  "state",
  "feedback",
  "error",
  "intent",
  "source",
  "data",
  "event_json",
] as const;

export type ReplayExportOptions = {
  format: ReplayExportFormat;
  output?: string;
};

/** Stream a replay log to a JSON array or a stable-column CSV file. */
export async function exportReplay(
  inputPath: string,
  options: ReplayExportOptions,
  stdout: Writable = process.stdout,
): Promise<void> {
  const outputPath = options.output;
  if (
    outputPath &&
    outputPath !== "-" &&
    resolve(outputPath) === resolve(inputPath)
  ) {
    throw new Error("Replay export input and output paths must be different");
  }

  const output =
    outputPath && outputPath !== "-"
      ? createWriteStream(outputPath, { encoding: "utf8" })
      : stdout;
  const closeOutput = output !== stdout;
  const lines = createInterface({
    input: createReadStream(inputPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let lineNumber = 0;
  let first = true;

  try {
    if (options.format === "json") await write(output, "[\n");
    else await write(output, `${csvColumns.join(",")}\n`);

    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim().length === 0) continue;
      const event = parseReplayEvent(line, inputPath, lineNumber);
      if (options.format === "json") {
        await write(output, `${first ? "" : ",\n"}${JSON.stringify(event)}`);
      } else {
        await write(
          output,
          `${csvColumns
            .map((column) =>
              csvCell(column === "event_json" ? event : event[column]),
            )
            .join(",")}\n`,
        );
      }
      first = false;
    }

    if (options.format === "json") await write(output, "\n]\n");
    if (closeOutput) {
      output.end();
      await finished(output);
    }
  } catch (error) {
    lines.close();
    if (closeOutput) output.destroy();
    throw error;
  }
}

export async function replayExportCommand(
  inputPath: string | undefined,
  format: string | boolean | undefined,
  output: string | boolean | undefined,
): Promise<void> {
  if (!inputPath) {
    throw new Error(
      "Usage: opencontroller replay export <events.jsonl> [--format json|csv] [--output <file>]",
    );
  }
  if (format !== undefined && format !== "json" && format !== "csv") {
    throw new Error("Invalid --format; expected one of: json, csv");
  }
  if (output !== undefined && typeof output !== "string") {
    throw new Error("--output requires a file path or - for stdout");
  }
  await exportReplay(inputPath, {
    format: format ?? "json",
    ...(output === undefined ? {} : { output }),
  });
}

function parseReplayEvent(
  line: string,
  path: string,
  lineNumber: number,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(
      `Invalid JSON in replay file ${path} at line ${lineNumber}`,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Invalid replay event in ${path} at line ${lineNumber}: expected an object`,
    );
  }
  return value as Record<string, unknown>;
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function write(output: Writable, chunk: string): Promise<void> {
  if (!output.write(chunk)) await once(output, "drain");
}
