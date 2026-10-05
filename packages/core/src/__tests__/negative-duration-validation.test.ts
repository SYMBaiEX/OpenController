import { describe, expect, spyOn, test } from "bun:test";
import { createActionMap, createController, DryRunAdapter } from "../index";

describe("negative action duration validation", () => {
  test("rejects negative durations before adapter output across command paths", async () => {
    const adapter = new DryRunAdapter();
    const controller = await createController({
      profile: "xbox",
      adapter,
      replay: false,
    });
    const initialHistoryLength = adapter.history.length;
    const initialStateHistoryLength = adapter.stateHistory.length;
    const neutral = spyOn(adapter, "neutral");

    await expect(controller.press("A", -1)).rejects.toThrow(
      "must not be negative",
    );
    await expect(controller.trigger("RT", 1, -1)).rejects.toThrow(
      "must not be negative",
    );

    const negativeCommands = [
      { type: "press", button: "A", durationMs: -1 },
      { type: "stick", stick: "LEFT", x: 1, y: 0, durationMs: -1 },
      { type: "trigger", trigger: "RT", value: 1, durationMs: -1 },
      { type: "dpad", direction: "UP", durationMs: -1 },
      { type: "combo", buttons: ["A", "B"], durationMs: -1 },
      { type: "touchpad", pressed: true, durationMs: -1 },
      { type: "motion", durationMs: -1 },
    ] as const;

    for (const command of negativeCommands) {
      await expect(controller.sequence([command])).rejects.toThrow(
        "must not be negative",
      );
    }

    await expect(
      controller.sequence([
        { type: "press", button: "A", durationMs: 0 },
        {
          type: "sequence",
          commands: [
            { type: "trigger", trigger: "RT", value: 1, durationMs: -1 },
          ],
        },
      ]),
    ).rejects.toThrow("must not be negative");

    const actions = createActionMap(controller, {
      attack: [{ type: "press", button: "A", durationMs: 50 }],
    });
    await expect(actions.run("attack", { durationMs: -1 })).rejects.toThrow(
      "must not be negative",
    );

    expect(adapter.history).toHaveLength(initialHistoryLength);
    expect(adapter.stateHistory).toHaveLength(initialStateHistoryLength);
    expect(neutral).not.toHaveBeenCalled();
    neutral.mockRestore();
    await controller.disconnect();
  });

  test("keeps zero-duration input persistent and positive durations timed", async () => {
    const adapter = new DryRunAdapter();
    const controller = await createController({
      profile: "xbox",
      adapter,
      replay: false,
    });

    await controller.press("A", 0);
    expect(controller.getState().buttons.A).toBe(true);

    await controller.trigger("RT", 0.5, 0);
    expect(controller.getState().analogButtons.RT).toBe(0.5);

    await controller.trigger("RT", 1, 1);
    expect(controller.getState().analogButtons.RT).toBe(0);
    expect(adapter.history.map((entry) => entry.command.type)).toEqual([
      "press",
      "trigger",
      "trigger",
      "trigger",
    ]);

    await controller.disconnect();
  });
});
