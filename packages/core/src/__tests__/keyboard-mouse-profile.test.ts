import { describe, expect, test } from "bun:test";
import {
  controllerProfiles,
  createInitialControllerState,
  createNativeBridgeStateMessage,
  hidGamepadButtonBits,
  resolveButton,
  resolveTrigger,
  toUniversal,
  xInputButtonBits,
} from "../index";

const profile = controllerProfiles["keyboard-mouse"];

describe("keyboard-mouse profile report contract", () => {
  test("native bridge gamepad reports encode mapped controls and preserve state-only controls", () => {
    const state = createInitialControllerState("keyboard-mouse-test", profile);
    state.connected = true;
    for (const button of [
      "KEY_SPACE",
      "KEY_ESCAPE",
      "KEY_F",
      "KEY_E",
      "MOUSE_RIGHT",
      "MOUSE_LEFT",
      "DPAD_UP",
      "DPAD_DOWN",
      "DPAD_LEFT",
      "DPAD_RIGHT",
      "KEY_W",
      "KEY_A",
      "KEY_S",
      "KEY_D",
      "MOUSE_MIDDLE",
    ]) {
      state.buttons[button] = true;
    }
    state.analogButtons.MOUSE_RIGHT = 1;
    state.analogButtons.MOUSE_LEFT = 1;

    const message = createNativeBridgeStateMessage(state, { timestamp: 1 });
    const expectedMask =
      xInputButtonBits.A |
      xInputButtonBits.B |
      xInputButtonBits.X |
      xInputButtonBits.Y |
      xInputButtonBits.DPAD_UP |
      xInputButtonBits.DPAD_DOWN |
      xInputButtonBits.DPAD_LEFT |
      xInputButtonBits.DPAD_RIGHT;

    expect(message.report).toEqual({
      buttons: expectedMask,
      leftTrigger: 255,
      rightTrigger: 255,
      leftStickX: 0,
      leftStickY: -0,
      rightStickX: 0,
      rightStickY: -0,
    });
    expect(message.hidReport).toEqual({
      reportId: 1,
      buttons:
        hidGamepadButtonBits.A |
        hidGamepadButtonBits.B |
        hidGamepadButtonBits.X |
        hidGamepadButtonBits.Y |
        hidGamepadButtonBits.DPAD_UP |
        hidGamepadButtonBits.DPAD_DOWN |
        hidGamepadButtonBits.DPAD_LEFT |
        hidGamepadButtonBits.DPAD_RIGHT,
      leftTrigger: 255,
      rightTrigger: 255,
      leftStickX: 0,
      leftStickY: -0,
      rightStickX: 0,
      rightStickY: -0,
    });
    expect(message.state?.buttons).toMatchObject({
      KEY_W: true,
      KEY_A: true,
      KEY_S: true,
      KEY_D: true,
      MOUSE_MIDDLE: true,
    });
  });

  test("canonical controls and aliases resolve to the documented mappings", () => {
    const mappings = [
      ["KEY_SPACE", "SOUTH", "A"],
      ["KEY_ESCAPE", "EAST", "B"],
      ["KEY_F", "WEST", "X"],
      ["KEY_E", "NORTH", "Y"],
      ["MOUSE_RIGHT", "LEFT_TRIGGER", "LT"],
      ["MOUSE_LEFT", "RIGHT_TRIGGER", "RT"],
    ] as const;

    for (const [button, universal, alias] of mappings) {
      expect(toUniversal(profile, button)).toBe(universal);
      expect(resolveButton(profile, alias)).toBe(button);
      expect(toUniversal(profile, alias)).toBe(universal);
    }

    expect(resolveTrigger(profile, "LT")).toBe("MOUSE_RIGHT");
    expect(resolveTrigger(profile, "RT")).toBe("MOUSE_LEFT");
    for (const direction of ["UP", "DOWN", "LEFT", "RIGHT"] as const) {
      expect(toUniversal(profile, `DPAD_${direction}`)).toBe(
        `DPAD_${direction}`,
      );
    }
  });

  test("the five accepted unmapped controls have no universal mapping", () => {
    for (const button of ["KEY_W", "KEY_A", "KEY_S", "KEY_D", "MOUSE_MIDDLE"]) {
      expect(resolveButton(profile, button)).toBe(button);
      expect(toUniversal(profile, button)).toBeUndefined();
    }
  });
});
