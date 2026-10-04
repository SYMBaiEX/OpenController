import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const replayEventTypes = [
  "command",
  "state",
  "feedback",
  "error",
  "annotation",
] as const;

type ReplayEventType = (typeof replayEventTypes)[number];
type ReplaySummaryEvent = {
  type: ReplayEventType;
  timestamp: number;
};

export async function replayCommand(path: string | undefined): Promise<void> {
  if (!path) {
    throw new Error(
      "Usage: opencontroller replay ./replays/session/events.jsonl",
    );
  }

  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  const counts: Record<ReplayEventType, number> = {
    command: 0,
    state: 0,
    feedback: 0,
    error: 0,
    annotation: 0,
  };
  let eventCount = 0;
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) {
      continue;
    }

    const event = parseReplaySummaryEvent(line, lineNumber);
    counts[event.type] += 1;
    eventCount += 1;
    firstTimestamp ??= event.timestamp;
    lastTimestamp = event.timestamp;
  }

  console.log("OpenController Replay Summary");
  console.log(`  file: ${path}`);
  console.log(`  events: ${eventCount}`);
  console.log(`  commands: ${counts.command}`);
  console.log(`  states: ${counts.state}`);
  console.log(`  errors: ${counts.error}`);

  if (firstTimestamp !== undefined && lastTimestamp !== undefined) {
    console.log(`  first timestamp: ${firstTimestamp}`);
    console.log(`  last timestamp: ${lastTimestamp}`);
  }
}

function parseReplaySummaryEvent(
  line: string,
  lineNumber: number,
): ReplaySummaryEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`Invalid JSON in replay file at line ${lineNumber}`);
  }

  if (!isRecord(value)) {
    throw new Error(
      `Invalid replay event at line ${lineNumber}: expected an object`,
    );
  }
  const type = replayEventTypes.find((candidate) => candidate === value.type);
  if (!type) {
    throw new Error(
      `Invalid replay event at line ${lineNumber}: unknown event type`,
    );
  }
  if (
    typeof value.timestamp !== "number" ||
    !Number.isFinite(value.timestamp)
  ) {
    throw new Error(
      `Invalid replay event at line ${lineNumber}: timestamp must be a finite number`,
    );
  }

  switch (type) {
    case "command":
      if (
        typeof value.controllerId !== "string" ||
        typeof value.profile !== "string" ||
        !isRecord(value.command) ||
        typeof value.command.type !== "string"
      ) {
        throw new Error(
          `Invalid command event at line ${lineNumber}: expected controllerId, profile, and command.type`,
        );
      }
      break;
    case "state":
      if (typeof value.controllerId !== "string" || !isRecord(value.state)) {
        throw new Error(
          `Invalid state event at line ${lineNumber}: expected controllerId and state`,
        );
      }
      break;
    case "feedback":
      if (
        typeof value.controllerId !== "string" ||
        !isRecord(value.feedback) ||
        !isRecord(value.stateAfter)
      ) {
        throw new Error(
          `Invalid feedback event at line ${lineNumber}: expected controllerId, feedback, and stateAfter`,
        );
      }
      break;
    case "error":
      if (
        typeof value.controllerId !== "string" ||
        typeof value.error !== "string"
      ) {
        throw new Error(
          `Invalid error event at line ${lineNumber}: expected controllerId and error`,
        );
      }
      break;
    case "annotation":
      if (typeof value.label !== "string") {
        throw new Error(
          `Invalid annotation event at line ${lineNumber}: expected label`,
        );
      }
      break;
  }

  return { type, timestamp: value.timestamp };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
