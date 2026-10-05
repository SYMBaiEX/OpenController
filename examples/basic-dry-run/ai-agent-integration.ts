import { randomUUID } from "node:crypto";
import type { ControllerState } from "@opencontroller/core";
import { createActionMap, createController } from "@opencontroller/core";

const semanticActions = {
  moveLeft: [{ type: "setStick", stick: "LEFT", x: -1, y: 0 }],
  moveRight: [{ type: "setStick", stick: "LEFT", x: 1, y: 0 }],
  confirm: [{ type: "setButton", button: "A", pressed: true }],
} as const;

export type SemanticActionId = keyof typeof semanticActions;

export type InputBinding = {
  /** An input identifier supplied by the consuming application. */
  sourceId: string;
  /** A stable semantic action understood by this application. */
  actionId: string;
};

export const wasdBindings: readonly InputBinding[] = [
  { sourceId: "KeyA", actionId: "moveLeft" },
  { sourceId: "KeyD", actionId: "moveRight" },
  { sourceId: "Space", actionId: "confirm" },
];

export const arrowBindings: readonly InputBinding[] = [
  { sourceId: "ArrowLeft", actionId: "moveLeft" },
  { sourceId: "ArrowRight", actionId: "moveRight" },
  { sourceId: "Enter", actionId: "confirm" },
];

export function validateInputBindings(bindings: readonly InputBinding[]): void {
  const validActions = new Set<string>(Object.keys(semanticActions));
  const seenSources = new Set<string>();

  for (const binding of bindings) {
    if (seenSources.has(binding.sourceId)) {
      throw new Error(`Conflicting source identifier: ${binding.sourceId}`);
    }
    seenSources.add(binding.sourceId);

    if (!validActions.has(binding.actionId)) {
      throw new Error(`Unknown semantic action: ${binding.actionId}`);
    }
  }
}

export async function runSemanticBindingExample(
  bindings: readonly InputBinding[],
  sourceId: string,
  replayDir = `replays/ai-agent-bindings-${randomUUID()}`,
): Promise<ControllerState> {
  // Validate the complete caller configuration before creating or commanding
  // a controller. Invalid configurations cannot dispatch a partial action.
  validateInputBindings(bindings);
  const selectedBinding = bindings.find(
    (binding) => binding.sourceId === sourceId,
  );
  if (!selectedBinding) {
    throw new Error(`No binding for source identifier: ${sourceId}`);
  }

  const controller = await createController({
    profile: "xbox",
    adapter: "dry-run",
    replay: { dir: replayDir, source: "semantic-input-bindings" },
  });
  const actions = createActionMap(controller, semanticActions);

  // The consuming application owns input capture and invokes this function
  // with its own source identifier. OpenController only executes the action.
  if (!actions.has(selectedBinding.actionId)) {
    throw new Error(`Unknown semantic action: ${selectedBinding.actionId}`);
  }
  await actions.run(selectedBinding.actionId, {
    intent: selectedBinding.actionId,
    source: selectedBinding.sourceId,
  });
  const state = controller.getState();
  await controller.disconnect();
  return state;
}

if (import.meta.main) {
  const wasdState = await runSemanticBindingExample(wasdBindings, "KeyA");
  const arrowsState = await runSemanticBindingExample(
    arrowBindings,
    "ArrowLeft",
  );
  console.log({ wasdState, arrowsState });
}
