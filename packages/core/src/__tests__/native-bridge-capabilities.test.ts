import { describe, expect, test } from "bun:test";
import { NativeBridgeAdapter, NativeProcessBridgeAdapter } from "../adapters";

describe("native bridge adapter capabilities", () => {
  test("describe default serialized state and profile report outputs", () => {
    const adapters = [
      new NativeBridgeAdapter(),
      new NativeProcessBridgeAdapter({ command: "/bin/cat" }),
    ];

    for (const adapter of adapters) {
      const capabilities = adapter.capabilities();
      expect(capabilities.supportsTouchpad).toBe(true);
      expect(capabilities.supportsGyro).toBe(true);
      expect(capabilities.supportsDeviceStatus).toBe(true);
      expect(capabilities.outputFormats).toEqual([
        "controller-state",
        "xinput-report",
        "hid-gamepad-report",
        "hid-playstation-extended-report",
        "hid-switch-extended-report",
        "native-bridge-jsonl",
      ]);
      expect(capabilities.reportFormats).toEqual([
        "xinput",
        "hid-gamepad",
        "hid-playstation-extended",
        "hid-switch-extended",
      ]);
    }
  });

  test("omit capability claims for fully suppressed payload channels", () => {
    const adapters = [
      new NativeBridgeAdapter({
        includeState: false,
        includeExtensions: false,
        includeProfileHidReport: false,
      }),
      new NativeProcessBridgeAdapter({
        command: "/bin/cat",
        includeState: false,
        includeExtensions: false,
        includeProfileHidReport: false,
      }),
    ];

    for (const adapter of adapters) {
      const capabilities = adapter.capabilities();
      expect(capabilities.supportsTouchpad).toBe(false);
      expect(capabilities.supportsGyro).toBe(false);
      expect(capabilities.supportsDeviceStatus).toBe(false);
      expect(capabilities.outputFormats).toEqual([
        "xinput-report",
        "hid-gamepad-report",
        "native-bridge-jsonl",
      ]);
      expect(capabilities.reportFormats).toEqual(["xinput", "hid-gamepad"]);
      expect(capabilities.supportedCommands).toContain("touchpad");
      expect(capabilities.supportedCommands).toContain("motion");
    }
  });
});
