import { once } from "node:events";
import type { FileHandle } from "node:fs/promises";
import { open, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
  const input = await open(inputPath, "r");
  let inputStream: ReturnType<FileHandle["createReadStream"]> | undefined;
  let outputHandle: FileHandle | undefined;
  let outputStream: ReturnType<FileHandle["createWriteStream"]> | undefined;
  let lines: ReturnType<typeof createInterface> | undefined;

  try {
    const inputStat = await input.stat();
    if (!inputStat.isFile()) {
      throw new Error(`Replay input is not a regular file: ${inputPath}`);
    }
    const inputRealPath = await realpath(inputPath);
    if (outputPath && outputPath !== "-") {
      outputHandle = await openSafeOutput(outputPath, inputRealPath, inputStat);
      outputStream = outputHandle.createWriteStream({ encoding: "utf8" });
    }

    // The input is already opened and confirmed before any output is created or truncated.
    inputStream = input.createReadStream();
    const output = outputStream ?? stdout;
    lines = createInterface({
      input: inputStream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    let lineNumber = 0;
    let first = true;

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
    if (outputStream) {
      output.end();
      await finished(output);
    }
  } catch (error) {
    lines?.close();
    inputStream?.destroy();
    outputStream?.destroy();
    if (outputHandle && !outputStream) await outputHandle.close();
    if (!inputStream) await input.close();
    throw error;
  }
}

async function openSafeOutput(
  outputPath: string,
  inputRealPath: string,
  inputStat: Awaited<ReturnType<FileHandle["stat"]>>,
): Promise<FileHandle> {
  const resolvedOutputPath = resolve(outputPath);
  try {
    const outputRealPath = await realpath(resolvedOutputPath);
    const existingStat = await stat(resolvedOutputPath);
    rejectAlias(
      outputRealPath === inputRealPath || sameFile(existingStat, inputStat),
    );
    if (!existingStat.isFile()) {
      throw new Error(
        `Replay export destination is not a regular file: ${outputPath}`,
      );
    }

    // Open without truncating, then verify the opened inode to cover path races.
    const handle = await open(resolvedOutputPath, "r+");
    try {
      const openedStat = await handle.stat();
      rejectAlias(sameFile(openedStat, inputStat));
      if (!openedStat.isFile()) {
        throw new Error(
          `Replay export destination is not a regular file: ${outputPath}`,
        );
      }
      await handle.truncate(0);
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const canonicalParent = await realpath(dirname(resolvedOutputPath));
  const canonicalOutputPath = join(
    canonicalParent,
    basename(resolvedOutputPath),
  );
  rejectAlias(canonicalOutputPath === inputRealPath);

  // wx avoids following a symlink or truncating a path created after preflight.
  const handle = await open(resolvedOutputPath, "wx");
  try {
    rejectAlias(sameFile(await handle.stat(), inputStat));
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

function rejectAlias(alias: boolean): void {
  if (alias) {
    throw new Error("Replay export input and output paths must be different");
  }
}

function sameFile(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
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
