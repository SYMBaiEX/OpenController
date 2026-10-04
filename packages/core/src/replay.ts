import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CommandContext,
  ControllerCommand,
  ControllerFeedbackEvent,
  ControllerProfileName,
  ControllerState,
  ReplayConfig,
  ReplayEvent,
} from "./types";

export class ReplayLogger {
  readonly dir: string;
  private readonly enabled: boolean;

  constructor(
    private readonly controllerId: string,
    private readonly profile: ControllerProfileName,
    private readonly config: ReplayConfig = {},
  ) {
    this.enabled = config.enabled ?? true;
    this.dir =
      config.dir ?? join("replays", defaultSessionDir(config.sessionId));
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await mkdir(this.dir, { recursive: true });
    await writeFile(
      join(this.dir, "session.json"),
      `${JSON.stringify(
        {
          id: this.config.sessionId ?? this.dir.split("/").at(-1),
          controllerId: this.controllerId,
          profile: this.profile,
          source: this.config.source ?? "opencontroller",
          startedAt: new Date().toISOString(),
          metadata: this.config.metadata ?? {},
        },
        null,
        2,
      )}\n`,
    );
  }

  async command(
    command: ControllerCommand,
    stateBefore: ControllerState,
    stateAfter: ControllerState,
    context: CommandContext = {},
  ): Promise<void> {
    await this.write({
      type: "command",
      timestamp: Date.now(),
      controllerId: this.controllerId,
      profile: this.profile,
      command,
      stateBefore,
      stateAfter,
      ...context,
    });
  }

  async state(state: ControllerState): Promise<void> {
    await this.write({
      type: "state",
      timestamp: Date.now(),
      controllerId: this.controllerId,
      state,
    });
  }

  async feedback(
    feedback: ControllerFeedbackEvent,
    stateAfter: ControllerState,
  ): Promise<void> {
    await this.write({
      type: "feedback",
      timestamp: Date.now(),
      controllerId: this.controllerId,
      feedback,
      stateAfter,
    });
  }

  async error(
    error: unknown,
    command?: ControllerCommand,
    context: CommandContext = {},
  ): Promise<void> {
    const nativeError = isNativeError(error);
    const message = nativeError
      ? safeProperty(error, "message")
      : safeString(error);
    await this.write({
      type: "error",
      timestamp: Date.now(),
      controllerId: this.controllerId,
      error: typeof message === "string" ? message : safeString(message),
      ...(command ? { command } : {}),
      ...(context.intent === undefined ? {} : { intent: context.intent }),
      ...(context.source === undefined ? {} : { source: context.source }),
      ...(nativeError && typeof safeProperty(error, "name") === "string"
        ? { errorName: safeProperty(error, "name") as string }
        : {}),
      ...(nativeError && typeof safeProperty(error, "stack") === "string"
        ? { errorStack: safeProperty(error, "stack") as string }
        : {}),
      ...(!nativeError ? { errorDetails: toJsonSafe(error) } : {}),
    });
  }

  async annotation(
    label: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.write({
      type: "annotation",
      timestamp: Date.now(),
      label,
      ...(data ? { data } : {}),
    });
  }

  private async write(event: ReplayEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await appendFile(
      join(this.dir, "events.jsonl"),
      `${JSON.stringify(event)}\n`,
    );

    if (event.type === "command") {
      await appendFile(
        join(this.dir, "commands.jsonl"),
        `${JSON.stringify(event)}\n`,
      );
    }
    if (event.type === "state") {
      await appendFile(
        join(this.dir, "states.jsonl"),
        `${JSON.stringify(event)}\n`,
      );
    }
    if (event.type === "feedback") {
      await appendFile(
        join(this.dir, "feedback.jsonl"),
        `${JSON.stringify(event)}\n`,
      );
    }
    if (event.type === "error") {
      await appendFile(
        join(this.dir, "errors.jsonl"),
        `${JSON.stringify(event)}\n`,
      );
    }
  }
}

function safeProperty(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function isNativeError(value: unknown): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unprintable error value]";
  }
}

function toJsonSafe(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol" || typeof value === "function")
    return safeString(value);
  if (depth >= 8) return "[depth limit]";
  if (typeof value !== "object") return safeString(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, (_, index) => {
        try {
          return toJsonSafe(value[index], seen, depth + 1);
        } catch {
          return "[unreadable]";
        }
      });
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      try {
        result[key] = toJsonSafe(Reflect.get(value, key), seen, depth + 1);
      } catch {
        result[key] = "[unreadable]";
      }
    }
    return result;
  } catch {
    return "[unserializable]";
  } finally {
    seen.delete(value);
  }
}

function defaultSessionDir(sessionId?: string): string {
  if (sessionId) {
    return sessionId;
  }

  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z");
  return `${stamp}-session`;
}
