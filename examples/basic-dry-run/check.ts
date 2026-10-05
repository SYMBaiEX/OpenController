import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  arrowBindings,
  runSemanticBindingExample,
  validateInputBindings,
  wasdBindings,
} from "./ai-agent-integration";
import { runGettingStartedDryRun } from "./getting-started";
import { runBasicDryRunExample } from "./index";

type ReplayCommand = {
  type: "command";
  command: { type: string; button?: string; intent?: string };
  intent?: string;
  stateAfter?: {
    buttons: Record<string, boolean>;
    analogButtons: Record<string, number>;
    sticks: { left: { x: number; y: number } };
  };
};

type ReplayState = {
  type: "state";
  state?: { connected: boolean };
};

async function readEvents<T>(
  replayDir: string,
  filename: "commands.jsonl" | "events.jsonl",
): Promise<T[]> {
  const contents = await readFile(join(replayDir, filename), "utf8");
  return contents
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

const replayRoot = await mkdtemp(
  join(tmpdir(), "opencontroller-dry-run-docs-"),
);

try {
  const gettingStartedDir = join(replayRoot, "getting-started");
  const gettingStartedState = await runGettingStartedDryRun(gettingStartedDir);
  assert.equal(gettingStartedState.buttons.A, true);
  assert.equal(gettingStartedState.analogButtons.RT, 0.25);
  assert.deepEqual(gettingStartedState.sticks.left, { x: 0.4, y: 0 });
  const gettingStartedCommands = await readEvents<ReplayCommand>(
    gettingStartedDir,
    "commands.jsonl",
  );
  assert.equal(gettingStartedCommands[0]?.command.type, "setState");
  assert.equal(gettingStartedCommands[0]?.stateAfter?.buttons.A, true);
  assert.equal(gettingStartedCommands[0]?.stateAfter?.analogButtons.RT, 0.25);
  const neutralCommand = gettingStartedCommands.find(
    (event) => event.command.type === "neutral",
  );
  assert.ok(neutralCommand);
  assert.equal(neutralCommand.stateAfter?.buttons.A, false);
  const gettingStartedStates = await readEvents<ReplayState>(
    gettingStartedDir,
    "events.jsonl",
  );
  assert.equal(gettingStartedStates.at(-1)?.state?.connected, false);

  const wasdDir = join(replayRoot, "wasd");
  const wasdState = await runSemanticBindingExample(
    wasdBindings,
    "KeyA",
    wasdDir,
  );
  assert.deepEqual(wasdState.sticks.left, { x: -1, y: 0 });
  const wasdCommands = await readEvents<ReplayCommand>(
    wasdDir,
    "commands.jsonl",
  );
  assert.deepEqual(wasdCommands.map((event) => event.intent).filter(Boolean), [
    "moveLeft",
  ]);
  assert.equal(wasdCommands[0]?.command.type, "setStick");

  const arrowsDir = join(replayRoot, "arrows");
  const arrowsState = await runSemanticBindingExample(
    arrowBindings,
    "ArrowLeft",
    arrowsDir,
  );
  assert.deepEqual(arrowsState.sticks.left, { x: -1, y: 0 });
  const arrowCommands = await readEvents<ReplayCommand>(
    arrowsDir,
    "commands.jsonl",
  );
  assert.deepEqual(arrowCommands.map((event) => event.intent).filter(Boolean), [
    "moveLeft",
  ]);
  assert.equal(arrowCommands[0]?.command.type, "setStick");

  const confirmDir = join(replayRoot, "wasd-confirm");
  const confirmState = await runSemanticBindingExample(
    wasdBindings,
    "Space",
    confirmDir,
  );
  assert.equal(confirmState.buttons.A, true);
  const confirmCommands = await readEvents<ReplayCommand>(
    confirmDir,
    "commands.jsonl",
  );
  assert.deepEqual(
    confirmCommands.map((event) => event.intent).filter(Boolean),
    ["confirm"],
  );
  assert.equal(confirmCommands[0]?.command.button, "A");

  const unknownBindingsDir = join(replayRoot, "unknown-action");
  await assert.rejects(
    runSemanticBindingExample(
      [{ sourceId: "KeyA", actionId: "teleport" }],
      "KeyA",
      unknownBindingsDir,
    ),
    /Unknown semantic action: teleport/,
  );
  await assert.rejects(access(unknownBindingsDir));

  const conflictBindingsDir = join(replayRoot, "conflicting-source");
  await assert.rejects(
    runSemanticBindingExample(
      [
        { sourceId: "KeyA", actionId: "moveLeft" },
        { sourceId: "KeyA", actionId: "confirm" },
      ],
      "KeyA",
      conflictBindingsDir,
    ),
    /Conflicting source identifier: KeyA/,
  );
  await assert.rejects(access(conflictBindingsDir));
  assert.throws(
    () => validateInputBindings([{ sourceId: "KeyA", actionId: "nope" }]),
    /Unknown semantic action/,
  );

  const basicDir = join(replayRoot, "basic");
  const basicState = await runBasicDryRunExample(basicDir);
  assert.equal(basicState.buttons.B, false);
  assert.equal(basicState.sticks.left.y, 0);
  const basicCommands = await readEvents<ReplayCommand>(
    basicDir,
    "commands.jsonl",
  );
  assert.ok(basicCommands.some((event) => event.intent === "interact"));
  assert.ok(basicCommands.some((event) => event.intent === "move_forward"));
  assert.ok(
    basicCommands.some(
      (event) => event.intent === "dodge" && event.command.button === "B",
    ),
  );

  console.log(
    "Dry-run documentation examples updated state, replay logs, and rejected invalid bindings before dispatch.",
  );
} finally {
  await rm(replayRoot, { recursive: true, force: true });
}
