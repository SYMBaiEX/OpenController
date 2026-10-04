import type { ControllerState } from "@opencontroller/core";
import { createActionMap, createController } from "@opencontroller/core";

export async function runAgentActionMapExample(
  replayDir = "replays/ai-agent-action-map",
): Promise<{ heldState: ControllerState; releasedState: ControllerState }> {
  const controller = await createController({
    profile: "xbox",
    adapter: "dry-run",
    replay: { dir: replayDir, source: "ai-agent-action-map" },
  });
  const actions = createActionMap(controller, {
    holdBlock: [{ type: "setButton", button: "LB", pressed: true }],
    releaseBlock: [{ type: "setButton", button: "LB", pressed: false }],
  });

  await actions.run("holdBlock");
  const heldState = controller.getState();
  await actions.run("releaseBlock");
  const releasedState = controller.getState();

  await controller.disconnect();
  return { heldState, releasedState };
}

if (import.meta.main) {
  console.log(await runAgentActionMapExample());
}
