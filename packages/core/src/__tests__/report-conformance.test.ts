import { describe, expect, test } from "bun:test";
import {
  createController,
  decodeHidGamepadReport,
  decodeHidPlayStationExtendedReport,
  decodeHidSwitchExtendedReport,
  decodeXInputReport,
  encodeHidGamepadReport,
  encodeHidPlayStationExtendedReport,
  encodeHidSwitchExtendedReport,
  encodeXInputReport,
  xInputButtonBits,
} from "../index";

const sharedButtons = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "BACK", "START", "LS", "RS"],
  playstation: [
    "CROSS",
    "CIRCLE",
    "SQUARE",
    "TRIANGLE",
    "L1",
    "R1",
    "SHARE",
    "OPTIONS",
    "L3",
    "R3",
  ],
  switch: ["B", "A", "Y", "X", "L", "R", "MINUS", "PLUS", "LS", "RS"],
  "generic-hid": [
    "BUTTON_0",
    "BUTTON_1",
    "BUTTON_2",
    "BUTTON_3",
    "BUTTON_4",
    "BUTTON_5",
    "BUTTON_8",
    "BUTTON_9",
    "BUTTON_10",
    "BUTTON_11",
  ],
} as const;

const commonMask =
  xInputButtonBits.A |
  xInputButtonBits.B |
  xInputButtonBits.X |
  xInputButtonBits.Y |
  xInputButtonBits.LB |
  xInputButtonBits.RB |
  xInputButtonBits.BACK |
  xInputButtonBits.START |
  xInputButtonBits.LS |
  xInputButtonBits.RS |
  xInputButtonBits.DPAD_UP |
  xInputButtonBits.DPAD_DOWN |
  xInputButtonBits.DPAD_LEFT |
  xInputButtonBits.DPAD_RIGHT;

const profiles = ["xbox", "playstation", "switch", "generic-hid"] as const;

describe("profile to report conformance", () => {
  test.each(profiles)(
    "%s shared controls map exactly in XInput and generic HID",
    async (profile) => {
      const controller = await createController({
        profile,
        adapter: "dry-run",
        replay: false,
      });
      const buttons = Object.fromEntries([
        ...sharedButtons[profile].map((button) => [button, true]),
        ...(["DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"] as const).map(
          (button) => [button, true],
        ),
      ]);
      const triggers =
        profile === "playstation"
          ? { L2: 0.25, R2: 0.75 }
          : profile === "switch"
            ? { ZL: 0.25, ZR: 0.75 }
            : profile === "generic-hid"
              ? { BUTTON_6: 0.25, BUTTON_7: 0.75 }
              : { LT: 0.25, RT: 0.75 };
      await controller.setState({
        buttons,
        triggers,
        sticks: { LEFT: { x: 0.125, y: -0.25 }, RIGHT: { x: -0.5, y: 0.75 } },
      });

      const state = controller.getState();
      const xinput = decodeXInputReport(encodeXInputReport(state));
      const hid = decodeHidGamepadReport(encodeHidGamepadReport(state));
      expect(xinput).toEqual({
        buttons: commonMask,
        leftTrigger: 64,
        rightTrigger: 191,
        leftStickX: 4096,
        leftStickY: 8192,
        rightStickX: -16384,
        rightStickY: -24576,
      });
      expect(hid).toEqual({
        reportId: 1,
        buttons: commonMask,
        leftTrigger: 64,
        rightTrigger: 191,
        leftStickX: 4096,
        leftStickY: 8192,
        rightStickX: -16384,
        rightStickY: -24576,
      });

      const controlBits = [
        ...sharedButtons[profile].map((button, index) => {
          const bit = [
            xInputButtonBits.A,
            xInputButtonBits.B,
            xInputButtonBits.X,
            xInputButtonBits.Y,
            xInputButtonBits.LB,
            xInputButtonBits.RB,
            xInputButtonBits.BACK,
            xInputButtonBits.START,
            xInputButtonBits.LS,
            xInputButtonBits.RS,
          ][index];
          if (bit === undefined) {
            throw new Error(`Missing expected bit for ${button}`);
          }
          return { button, bit };
        }),
        ...(["DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"] as const).map(
          (button) => ({
            button,
            bit: {
              DPAD_UP: xInputButtonBits.DPAD_UP,
              DPAD_DOWN: xInputButtonBits.DPAD_DOWN,
              DPAD_LEFT: xInputButtonBits.DPAD_LEFT,
              DPAD_RIGHT: xInputButtonBits.DPAD_RIGHT,
            }[button],
          }),
        ),
      ];
      for (const { button, bit } of controlBits) {
        await controller.setState({
          buttons: {
            ...Object.fromEntries(
              controlBits.map(({ button: name }) => [name, false]),
            ),
            [button]: true,
          },
        });
        const oneControl = controller.getState();
        expect(decodeXInputReport(encodeXInputReport(oneControl)).buttons).toBe(
          bit,
        );
        expect(
          decodeHidGamepadReport(encodeHidGamepadReport(oneControl)).buttons,
        ).toBe(bit);
      }
      await controller.disconnect();
    },
  );

  test("profile aliases map one at a time to their intended face buttons", async () => {
    const aliases = [
      { profile: "playstation", input: "X", bit: xInputButtonBits.A },
      { profile: "playstation", input: "O", bit: xInputButtonBits.B },
      { profile: "generic-hid", input: "A", bit: xInputButtonBits.A },
      { profile: "generic-hid", input: "B", bit: xInputButtonBits.B },
      { profile: "generic-hid", input: "X", bit: xInputButtonBits.X },
      { profile: "generic-hid", input: "Y", bit: xInputButtonBits.Y },
    ] as const;
    for (const { profile, input, bit } of aliases) {
      const controller = await createController({
        profile,
        adapter: "dry-run",
        replay: false,
      });
      await controller.setState({ buttons: { [input]: true } });
      const state = controller.getState();
      expect(decodeXInputReport(encodeXInputReport(state)).buttons).toBe(bit);
      expect(
        decodeHidGamepadReport(encodeHidGamepadReport(state)).buttons,
      ).toBe(bit);
      await controller.disconnect();
    }
  });

  test("PlayStation profile controls retain aliases and profile-only fields in extended HID", async () => {
    const controller = await createController({
      profile: "playstation",
      adapter: "dry-run",
      replay: false,
      safety: { allowSystemButtons: true },
    });
    await controller.setState({
      buttons: {
        X: true,
        O: true,
        SQUARE: true,
        TRIANGLE: true,
        L1: true,
        R1: true,
        DPAD_UP: true,
        DPAD_RIGHT: true,
        TOUCHPAD: true,
      },
      triggers: { L2: 0.25, R2: 0.75 },
      sticks: { LEFT: { x: 0.125, y: -0.25 }, RIGHT: { x: -0.5, y: 0.75 } },
      touchpad: {
        pressed: true,
        contacts: [{ id: 9, x: 0.25, y: 0.75, pressure: 0.5 }],
      },
      motion: {
        acceleration: { x: 0.125, y: -0.25, z: 0.5 },
        gyroscope: { x: -0.5, y: 0.25, z: 1 },
        orientation: { x: 0.75, y: -1, z: 0 },
      },
    });
    const state = controller.getState();
    const report = decodeHidPlayStationExtendedReport(
      encodeHidPlayStationExtendedReport(state),
    );
    expect(report.buttons).toBe(
      (commonMask &
        ~xInputButtonBits.BACK &
        ~xInputButtonBits.START &
        ~xInputButtonBits.LS &
        ~xInputButtonBits.RS &
        ~xInputButtonBits.DPAD_DOWN &
        ~xInputButtonBits.DPAD_LEFT) |
        0x0800,
    );
    expect([
      report.leftTrigger,
      report.rightTrigger,
      report.leftStickX,
      report.leftStickY,
      report.rightStickX,
      report.rightStickY,
    ]).toEqual([64, 191, 4096, 8192, -16384, -24576]);
    expect(report.touchpadPressed).toBe(true);
    expect(report.touchpadContacts[0]).toEqual({
      id: 9,
      active: true,
      x: 16384,
      y: 49151,
      pressure: 128,
    });
    expect([
      report.accelerationX,
      report.accelerationY,
      report.accelerationZ,
      report.gyroscopeX,
      report.gyroscopeY,
      report.gyroscopeZ,
      report.orientationX,
      report.orientationY,
      report.orientationZ,
    ]).toEqual([4096, -8192, 16384, -16384, 8192, 32767, 24575, -32768, 0]);
    await controller.disconnect();
  });

  test("Switch profile controls and motion map in extended HID", async () => {
    const controller = await createController({
      profile: "switch",
      adapter: "dry-run",
      replay: false,
    });
    await controller.setState({
      buttons: {
        B: true,
        A: true,
        Y: true,
        X: true,
        L: true,
        R: true,
        MINUS: true,
        PLUS: true,
        LS: true,
        RS: true,
        DPAD_UP: true,
        DPAD_DOWN: true,
        DPAD_LEFT: true,
        DPAD_RIGHT: true,
      },
      triggers: { ZL: 0.25, ZR: 0.75 },
      sticks: { LEFT: { x: 0.125, y: -0.25 }, RIGHT: { x: -0.5, y: 0.75 } },
      motion: {
        acceleration: { x: 0.125, y: -0.25, z: 0.5 },
        gyroscope: { x: -0.5, y: 0.25, z: 1 },
        orientation: { x: 0.75, y: -1, z: 0 },
      },
    });
    const report = decodeHidSwitchExtendedReport(
      encodeHidSwitchExtendedReport(controller.getState()),
    );
    expect(report.buttons).toBe(commonMask);
    expect([
      report.leftTrigger,
      report.rightTrigger,
      report.leftStickX,
      report.leftStickY,
      report.rightStickX,
      report.rightStickY,
    ]).toEqual([64, 191, 4096, 8192, -16384, -24576]);
    expect([
      report.accelerationX,
      report.accelerationY,
      report.accelerationZ,
      report.gyroscopeX,
      report.gyroscopeY,
      report.gyroscopeZ,
      report.orientationX,
      report.orientationY,
      report.orientationZ,
    ]).toEqual([4096, -8192, 16384, -16384, 8192, 32767, 24575, -32768, 0]);
    await controller.disconnect();
  });
});
