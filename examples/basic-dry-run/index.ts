import { randomUUID } from "node:crypto";
import {
  createActionMap,
  createController,
  xboxActionPreset,
} from "@opencontroller/core";

export async function runBasicDryRunExample(
  replayDir = `replays/basic-dry-run-example-${randomUUID()}`,
) {
  const controller = await createController({
    profile: "xbox",
    adapter: "dry-run",
    replay: {
      dir: replayDir,
      source: "basic-dry-run-example",
    },
  });

  const actions = createActionMap(controller, xboxActionPreset);

  await controller.press("A", 100, { intent: "interact" });
  await controller.moveStick("LEFT", { x: 0, y: -1 }, 250, {
    intent: "move_forward",
  });
  await actions.run("dodge");
  const state = controller.getState();
  await controller.neutral();

  await controller.disconnect();
  return state;
}

if (import.meta.main) {
  console.log(await runBasicDryRunExample());
}
