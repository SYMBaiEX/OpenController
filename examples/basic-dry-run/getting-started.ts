import { randomUUID } from "node:crypto";
import type { ControllerState } from "@opencontroller/core";
import { createController } from "@opencontroller/core";

export async function runGettingStartedDryRun(
  replayDir = `replays/getting-started-dry-run-${randomUUID()}`,
): Promise<ControllerState> {
  const controller = await createController({
    profile: "xbox",
    adapter: "dry-run",
    replay: { dir: replayDir, source: "getting-started-dry-run" },
  });

  await controller.setState({
    buttons: { A: true },
    triggers: { RT: 0.25 },
    sticks: { LEFT: { x: 0.4, y: 0 } },
  });
  const state = controller.getState();

  await controller.neutral();
  await controller.disconnect();
  return state;
}

if (import.meta.main) {
  console.log(await runGettingStartedDryRun());
}
