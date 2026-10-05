import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  ControllerCommand,
  ControllerProfileName,
  ControllerState,
  ControllerStatePatch,
} from "@opencontroller/core";
import {
  ControllerStateStore,
  normalizeCommand,
  resolveProfile,
} from "@opencontroller/core";

const profiles = [
  "xbox",
  "playstation",
  "switch",
  "generic-hid",
  "keyboard-mouse",
] as const;

const contextFields = [
  "timestamp",
  "sessionId, controllerId / state.id",
  "state.connected",
  "state.updatedAt",
  "state.status",
  "state.feedback",
] as const;

const commandTypes = new Set([
  "press",
  "release",
  "setButton",
  "stick",
  "setStick",
  "trigger",
  "setTrigger",
  "dpad",
  "setDpad",
  "setState",
  "setStatus",
  "touchpad",
  "motion",
  "wait",
  "neutral",
]);

export type ReplayVerifyResult = {
  events: number;
  verified: number;
  unverifiable: Array<{ event: number; line: number; reason: string }>;
  mismatch?: { event: number; line: number; field: string };
};

/** Verify each logged command at its recorded immediate state boundary. */
export async function verifyReplay(
  inputPath: string,
): Promise<ReplayVerifyResult> {
  const lines = createInterface({
    input: createReadStream(inputPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  const result: ReplayVerifyResult = {
    events: 0,
    verified: 0,
    unverifiable: [],
  };
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    result.events += 1;
    const eventNumber = result.events;
    const event = parseEvent(line, inputPath, lineNumber, eventNumber);
    if (event.type !== "command") continue;

    const unverifiable = (reason: string): void => {
      result.unverifiable.push({
        event: eventNumber,
        line: lineNumber,
        reason,
      });
    };

    if (!isRecord(event.command) || typeof event.command.type !== "string") {
      unverifiable("legacy command is missing command.type");
      continue;
    }
    if (!commandTypes.has(event.command.type)) {
      unverifiable(
        `unsupported command type ${JSON.stringify(event.command.type)}`,
      );
      continue;
    }
    const commandError = validateCommand(event.command);
    if (commandError) {
      unverifiable(`command ${commandError}`);
      continue;
    }
    if (typeof event.profile !== "string" || !isProfile(event.profile)) {
      unverifiable(
        `unsupported or missing profile ${JSON.stringify(event.profile)}`,
      );
      continue;
    }
    if (!isRecord(event.stateBefore)) {
      unverifiable("legacy command is missing stateBefore");
      continue;
    }
    if (!isRecord(event.stateAfter)) {
      unverifiable("legacy command is missing stateAfter");
      continue;
    }
    const stateError = validateControlState(event.stateBefore, event.profile);
    if (stateError) {
      unverifiable(`stateBefore ${stateError}`);
      continue;
    }
    const afterError = validateControlState(event.stateAfter, event.profile);
    if (afterError) {
      unverifiable(`stateAfter ${afterError}`);
      continue;
    }
    let predicted: {
      state: ControllerState;
      triggers?: Record<string, number>;
    };
    try {
      predicted = applyImmediateTransition(
        event.profile,
        typeof event.controllerId === "string"
          ? event.controllerId
          : typeof event.stateBefore.id === "string"
            ? event.stateBefore.id
            : "offline-replay",
        event.command,
        event.stateBefore,
      );
    } catch (error) {
      unverifiable(
        `unsupported or malformed ${event.command.type} command: ${errorMessage(error)}`,
      );
      continue;
    }

    const difference = firstControlDifference(predicted, event.stateAfter);
    if (difference) {
      result.mismatch = {
        event: eventNumber,
        line: lineNumber,
        field: difference,
      };
      break;
    }
    result.verified += 1;
  }

  return result;
}

export async function replayVerifyCommand(
  inputPath: string | undefined,
): Promise<void> {
  if (!inputPath) {
    throw new Error("Usage: opencontroller replay verify <events.jsonl>");
  }
  const result = await verifyReplay(inputPath);
  console.log("OpenController Replay Verification");
  console.log(`  file: ${inputPath}`);
  console.log(`  events: ${result.events}`);
  console.log(`  verified commands: ${result.verified}`);
  console.log(`  unverifiable commands: ${result.unverifiable.length}`);
  console.log(`  context not compared: ${contextFields.join(", ")}`);
  for (const item of result.unverifiable) {
    console.log(
      `  UNVERIFIABLE event ${item.event} line ${item.line}: ${item.reason}`,
    );
  }
  if (result.mismatch) {
    console.log(
      `  MISMATCH event ${result.mismatch.event} line ${result.mismatch.line}: ${result.mismatch.field}`,
    );
    process.exitCode = 1;
  } else if (result.unverifiable.length > 0) {
    console.log("  result: incomplete (some commands could not be verified)");
    process.exitCode = 1;
  } else {
    console.log("  result: verified");
  }
}

function parseEvent(
  line: string,
  path: string,
  lineNumber: number,
  eventNumber: number,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(
      `Invalid JSON in replay file ${path} at line ${lineNumber} (event ${eventNumber})`,
    );
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(
      `Invalid replay event in ${path} at line ${lineNumber} (event ${eventNumber}): expected an object with type`,
    );
  }
  if (
    !["command", "state", "feedback", "error", "annotation"].includes(
      value.type,
    )
  ) {
    throw new Error(
      `Unsupported replay event type ${JSON.stringify(value.type)} in ${path} at line ${lineNumber} (event ${eventNumber})`,
    );
  }
  return value;
}

function applyImmediateTransition(
  profileName: ControllerProfileName,
  controllerId: string,
  rawCommand: Record<string, unknown>,
  stateBefore: Record<string, unknown>,
): { state: ControllerState; triggers?: Record<string, number> } {
  const profile = resolveProfile(profileName);
  const command = rawCommand as unknown as ControllerCommand;
  const normalized = normalizeCommand(profile, controllerId, command).command;
  const before = stateBefore as unknown as ControllerState;
  const store = new ControllerStateStore(controllerId, profile);
  store.applyPatch(stateToPatch(before));

  let state: ControllerState;
  switch (normalized.type) {
    case "press":
      state = store.setButton(normalized.button, true, normalized.pressure);
      break;
    case "release":
      state = store.setButton(normalized.button, false, 0);
      break;
    case "setButton":
      state = store.setButton(
        normalized.button,
        normalized.pressed,
        normalized.pressed ? normalized.pressure : 0,
      );
      break;
    case "stick":
    case "setStick":
      state = store.setStick(normalized.stick, normalized.x, normalized.y);
      break;
    case "trigger":
    case "setTrigger":
      state = store.setTrigger(normalized.trigger, normalized.value);
      break;
    case "dpad":
      state = store.setDpad(normalized.direction, true);
      break;
    case "setDpad":
      state = store.setDpadState(normalized.direction);
      break;
    case "setState":
      state = store.applyPatch(normalized.state);
      break;
    case "setStatus":
      state = store.setStatus(normalized.status);
      break;
    case "touchpad":
      state = store.setTouchpad(
        normalized.contacts ?? [],
        normalized.pressed ?? false,
      );
      break;
    case "motion":
      state = store.setMotion(normalized);
      break;
    case "wait":
      state = store.getState();
      break;
    case "neutral":
      state = store.neutral();
      break;
    case "combo":
    case "sequence":
      throw new Error(
        `command ${normalized.type} is not an event-boundary command`,
      );
  }

  const triggers = isNumberRecord(stateBefore.triggers)
    ? { ...stateBefore.triggers }
    : undefined;
  if (triggers) {
    switch (normalized.type) {
      case "press":
        if (normalized.button in triggers) {
          triggers[normalized.button] = normalized.pressure ?? 1;
        }
        break;
      case "release":
        if (normalized.button in triggers) triggers[normalized.button] = 0;
        break;
      case "setButton":
        if (normalized.button in triggers) {
          triggers[normalized.button] = normalized.pressed
            ? (normalized.pressure ?? 1)
            : 0;
        }
        break;
      case "trigger":
      case "setTrigger":
        triggers[normalized.trigger] = normalized.value;
        break;
      case "setState":
        Object.assign(triggers, normalized.state.triggers ?? {});
        break;
      case "neutral":
        for (const trigger of Object.keys(triggers)) triggers[trigger] = 0;
        break;
    }
  }
  return { state, ...(triggers ? { triggers } : {}) };
}

function stateToPatch(state: ControllerState): ControllerStatePatch {
  const buttons: NonNullable<ControllerStatePatch["buttons"]> = {};
  for (const [button, pressed] of Object.entries(state.buttons)) {
    const pressure = state.analogButtons[button];
    buttons[button] = pressure === undefined ? pressed : { pressed, pressure };
  }
  return {
    buttons,
    triggers: state.analogButtons,
    sticks: {
      LEFT: state.sticks.left,
      RIGHT: state.sticks.right,
    },
    dpad: dpadDirectionFromState(state.dpad),
    touchpad: state.touchpad,
    motion: state.motion,
  };
}

function dpadDirectionFromState(
  dpad: ControllerState["dpad"],
): NonNullable<ControllerStatePatch["dpad"]> {
  const directions = [
    ...(dpad.up ? ["UP"] : []),
    ...(dpad.down ? ["DOWN"] : []),
    ...(dpad.left ? ["LEFT"] : []),
    ...(dpad.right ? ["RIGHT"] : []),
  ];
  if (directions.length === 0) return "NEUTRAL";
  const combined = directions.join("_");
  const valid = [
    "UP",
    "DOWN",
    "LEFT",
    "RIGHT",
    "UP_LEFT",
    "UP_RIGHT",
    "DOWN_LEFT",
    "DOWN_RIGHT",
  ];
  if (!valid.includes(combined)) {
    throw new Error("stateBefore has an unsupported dpad combination");
  }
  return combined as NonNullable<ControllerStatePatch["dpad"]>;
}

function validateControlState(
  value: Record<string, unknown>,
  profileName: ControllerProfileName,
): string | undefined {
  const profile = resolveProfile(profileName);
  if (!isBooleanRecord(value.buttons)) return "is missing a valid buttons map";
  if (!isNumberRecord(value.analogButtons)) {
    return "is missing a valid analogButtons map";
  }
  for (const button of profile.buttons) {
    if (typeof value.buttons[button] !== "boolean") {
      return `buttons.${button} is required and must be boolean`;
    }
  }
  for (const trigger of profile.triggers) {
    if (typeof value.analogButtons[trigger] !== "number") {
      return `analogButtons.${trigger} is required and must be finite`;
    }
  }
  if (
    !isRecord(value.sticks) ||
    !isVector2(value.sticks.left) ||
    !isVector2(value.sticks.right)
  ) {
    return "is missing valid sticks.left/right coordinates";
  }
  if (!isBooleanRecord(value.dpad)) return "is missing a valid dpad map";
  for (const direction of ["up", "down", "left", "right"] as const) {
    if (typeof value.dpad[direction] !== "boolean") {
      return `dpad.${direction} is required and must be boolean`;
    }
  }
  if (
    !isRecord(value.touchpad) ||
    typeof value.touchpad.pressed !== "boolean" ||
    !Array.isArray(value.touchpad.contacts)
  ) {
    return "is missing valid touchpad.pressed/contacts";
  }
  if (!isRecord(value.motion)) return "is missing a valid motion map";
  for (const axis of ["acceleration", "gyroscope", "orientation"] as const) {
    if (!isVector3(value.motion[axis]))
      return `motion.${axis} is required and must be finite`;
  }
  if (value.triggers !== undefined && !isNumberRecord(value.triggers)) {
    return "has an invalid triggers map";
  }
  return;
}

function validateCommand(command: Record<string, unknown>): string | undefined {
  const type = command.type;
  const string = (key: string): boolean =>
    typeof command[key] === "string" && command[key].length > 0;
  const number = (key: string): boolean => isFiniteNumber(command[key]);
  const optionalNumber = (key: string): boolean =>
    command[key] === undefined || number(key);
  const duration = (): boolean =>
    optionalNumber("durationMs") &&
    (command.durationMs === undefined || (command.durationMs as number) >= 0);
  const direction = (key: string): boolean =>
    [
      "UP",
      "DOWN",
      "LEFT",
      "RIGHT",
      "UP_LEFT",
      "UP_RIGHT",
      "DOWN_LEFT",
      "DOWN_RIGHT",
    ].includes(command[key] as string);
  const vector = (key: string): boolean =>
    command[key] === undefined || isVector3(command[key]);

  switch (type) {
    case "press":
      if (!string("button")) return "is missing required string button";
      if (!optionalNumber("pressure")) return "has invalid pressure";
      if (!duration()) return "has invalid durationMs";
      return;
    case "release":
      return string("button") ? undefined : "is missing required string button";
    case "setButton":
      if (!string("button")) return "is missing required string button";
      if (typeof command.pressed !== "boolean")
        return "is missing required boolean pressed";
      if (!optionalNumber("pressure")) return "has invalid pressure";
      return;
    case "stick":
    case "setStick":
      if (command.stick !== "LEFT" && command.stick !== "RIGHT") {
        return "has invalid stick (expected LEFT or RIGHT)";
      }
      if (!number("x") || !number("y"))
        return "is missing finite x/y coordinates";
      if (type === "stick" && !duration()) return "has invalid durationMs";
      return;
    case "trigger":
    case "setTrigger":
      if (!string("trigger") || !number("value")) {
        return "is missing required trigger and finite value";
      }
      if (type === "trigger" && !duration()) return "has invalid durationMs";
      return;
    case "dpad":
      if (!direction("direction")) return "has invalid dpad direction";
      if (!duration()) return "has invalid durationMs";
      return;
    case "setDpad":
      if (command.direction !== "NEUTRAL" && !direction("direction")) {
        return "has invalid dpad direction";
      }
      return;
    case "setState":
      return isRecord(command.state)
        ? undefined
        : "is missing required state object";
    case "setStatus":
      return isRecord(command.status)
        ? undefined
        : "is missing required status object";
    case "touchpad":
      if (
        command.pressed !== undefined &&
        typeof command.pressed !== "boolean"
      ) {
        return "has invalid pressed value";
      }
      if (command.contacts !== undefined && !Array.isArray(command.contacts)) {
        return "has invalid contacts array";
      }
      if (!duration()) return "has invalid durationMs";
      return;
    case "motion":
      if (
        !vector("acceleration") ||
        !vector("gyroscope") ||
        !vector("orientation")
      ) {
        return "has invalid motion vector";
      }
      if (!duration()) return "has invalid durationMs";
      return;
    case "wait":
      return number("ms") ? undefined : "is missing required finite ms";
    case "neutral":
      return;
    default:
      return `has unsupported command type ${JSON.stringify(type)}`;
  }
}

function firstControlDifference(
  predicted: { state: ControllerState; triggers?: Record<string, number> },
  actual: Record<string, unknown>,
): string | undefined {
  const predictedControls: Record<string, unknown> = {
    buttons: predicted.state.buttons,
    analogButtons: predicted.state.analogButtons,
    sticks: predicted.state.sticks,
    dpad: predicted.state.dpad,
    touchpad: predicted.state.touchpad,
    motion: predicted.state.motion,
  };
  for (const field of [
    "buttons",
    "analogButtons",
    "triggers",
    "sticks",
    "dpad",
    "touchpad",
    "motion",
  ]) {
    if (field === "triggers") {
      if ("triggers" in actual || predicted.triggers !== undefined) {
        const mismatch = compareValue(
          "triggers",
          predicted.triggers,
          actual.triggers,
        );
        if (mismatch) return mismatch;
      }
      continue;
    }
    const mismatch = compareValue(
      field,
      predictedControls[field],
      actual[field],
    );
    if (mismatch) return mismatch;
  }
  return;
}

function compareValue(
  path: string,
  expected: unknown,
  actual: unknown,
): string | undefined {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      const mismatch = compareValue(
        `${path}[${index}]`,
        expected[index],
        actual[index],
      );
      if (mismatch) return mismatch;
    }
    return;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [
      ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
    ].sort();
    for (const key of keys) {
      if (!(key in expected) || !(key in actual)) return `${path}.${key}`;
      const mismatch = compareValue(
        `${path}.${key}`,
        expected[key],
        actual[key],
      );
      if (mismatch) return mismatch;
    }
    return;
  }
  return path;
}

function isProfile(value: string): value is ControllerProfileName {
  return profiles.includes(value as (typeof profiles)[number]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function isVector2(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isVector3(
  value: unknown,
): value is { x: number; y: number; z: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
