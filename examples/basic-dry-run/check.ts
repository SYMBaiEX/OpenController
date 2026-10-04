import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentActionMapExample } from "./ai-agent-integration";
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

  const agentDir = join(replayRoot, "agent-action-map");
  const { heldState, releasedState } = await runAgentActionMapExample(agentDir);
  assert.equal(heldState.buttons.LB, true);
  assert.equal(releasedState.buttons.LB, false);
  const agentCommands = await readEvents<ReplayCommand>(
    agentDir,
    "commands.jsonl",
  );
  assert.deepEqual(
    agentCommands.slice(0, 2).map((event) => event.intent),
    ["holdBlock", "releaseBlock"],
  );
  assert.equal(agentCommands[0]?.command.button, "LB");

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

  console.log("Dry-run documentation examples updated state and replay logs.");
} finally {
  await rm(replayRoot, { recursive: true, force: true });
}
