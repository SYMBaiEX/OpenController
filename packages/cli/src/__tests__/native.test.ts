import { describe, expect, test } from "bun:test";
import {
  createNativeTestPlan,
  diagnoseNativeBackends,
  formatNativeDoctor,
  type NativeBackendId,
  type NativeBackendReport,
  normalizeNativeBackendSelection,
  prepareNativeSetup,
  resolveNativeBackendIds,
} from "../commands/native";

describe("native backend selection", () => {
  test("selects the current platform backend", () => {
    expect(resolveNativeBackendIds("current", "linux")).toEqual([
      "linux-uinput",
    ]);
    expect(resolveNativeBackendIds("current", "win32")).toEqual([
      "windows-virtual-gamepad",
    ]);
    expect(resolveNativeBackendIds("current", "darwin")).toEqual([
      "macos-driverkit",
    ]);
  });

  test("normalizes backend aliases", () => {
    expect(normalizeNativeBackendSelection("uinput")).toBe("linux-uinput");
    expect(normalizeNativeBackendSelection("vhf")).toBe(
      "windows-virtual-gamepad",
    );
    expect(normalizeNativeBackendSelection("windows-vhf")).toBe(
      "windows-virtual-gamepad",
    );
    expect(normalizeNativeBackendSelection("driverkit")).toBe(
      "macos-driverkit",
    );
  });

  test("selects every backend for all", () => {
    expect(resolveNativeBackendIds("all", "darwin")).toEqual([
      "linux-uinput",
      "windows-virtual-gamepad",
      "macos-driverkit",
    ]);
  });
});

describe("native backend diagnostics", () => {
  test("aggregates injected backend reports", async () => {
    const result = await diagnoseNativeBackends({
      selection: "all",
      platform: "darwin",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      probeHelper: async (backend) => ({
        path: `/fake/${backend}`,
        status: backend === "linux-uinput" ? "absent" : "available",
        executable: backend !== "linux-uinput",
      }),
      diagnoseBackend: async (backend) =>
        fakeReport(backend, backend !== "windows-virtual-gamepad"),
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(result.ok).toBe(false);
    expect(result.reports.map((report) => report.backend)).toEqual([
      "linux-uinput",
      "windows-virtual-gamepad",
      "macos-driverkit",
    ]);
    expect(result.reports[0]).toMatchObject({
      helper: {
        status: "absent",
        path: "/fake/linux-uinput",
        executable: false,
      },
      capabilities: {
        virtualDevice: true,
        deviceKind: "native-helper",
        rumble: true,
        lights: true,
        profileHidReports: true,
      },
    });
    expect(result.reports[1]?.requirements).toContainEqual(
      expect.objectContaining({
        id: "prerequisites",
        status: "unknown",
      }),
    );
    expect(result.reports[2]?.requirements?.map(({ id }) => id)).toContain(
      "signing",
    );
    expect(result.reports[1]?.capabilities?.deviceKind).toBe(
      "os-virtual-gamepad",
    );
    expect(result.reports[0]?.nextSteps?.[0]).toContain("Build or install");
  });

  test("classifies inaccessible helpers distinctly from missing helpers", async () => {
    const result = await diagnoseNativeBackends({
      selection: "linux-uinput",
      platform: "linux",
      diagnoseBackend: async (backend) => fakeReport(backend, false),
      probeHelper: async () => ({
        path: "/fake/denied-helper",
        status: "unavailable",
        executable: false,
        issue: "permission-denied",
      }),
    });

    expect(result.reports[0]?.helper?.status).toBe("unavailable");
    expect(result.reports[0]?.nextSteps?.[0]).toContain("cannot access it");
  });

  test("keeps legacy diagnostic ok separate from full readiness", async () => {
    const result = await diagnoseNativeBackends({
      selection: "linux-uinput",
      platform: "linux",
      diagnoseBackend: async (backend) => fakeReport(backend, true),
      probeHelper: async () => ({
        path: "/fake/missing-helper",
        status: "absent",
        executable: false,
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.helperReady).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.reports[0]?.ready).toBe(false);
    const output = formatNativeDoctor(result);
    expect(output).toContain("Backend diagnostics ready: yes");
    expect(output).toContain("Native helpers available: no");
    expect(output).toContain("Ready: no");
  });

  test("rejects a directory at the configured helper path", async () => {
    const result = await diagnoseNativeBackends({
      selection: "linux-uinput",
      platform: "linux",
      helperPaths: { "linux-uinput": process.cwd() },
      diagnoseBackend: async (backend) => fakeReport(backend, false),
    });

    expect(result.reports[0]?.helper).toMatchObject({
      status: "unavailable",
      issue: "not-regular-file",
      fileType: "directory",
    });
    expect(result.reports[0]?.nextSteps?.[0]).toContain("not a regular file");
  });

  test("does not recommend off-platform privileged steps", async () => {
    const result = await diagnoseNativeBackends({
      selection: "all",
      platform: "linux",
      diagnoseBackend: async (backend) => ({
        ...fakeReport(backend, false),
        supportedPlatform: backend === "linux-uinput",
      }),
      probeHelper: async (backend) => ({
        path: `/fake/${backend}`,
        status: "absent",
        executable: false,
      }),
    });

    for (const report of result.reports.filter(
      ({ backend }) => backend !== "linux-uinput",
    )) {
      expect(
        report.requirements?.some(
          (requirement) =>
            ["elevation", "signing", "activation"].includes(requirement.id) &&
            requirement.status === "needed",
        ),
      ).toBe(false);
      expect(
        report.nextSteps?.some((step) => step.startsWith("Build or install")),
      ).toBe(false);
    }
  });

  test("formats a native doctor summary", () => {
    const output = formatNativeDoctor({
      schemaVersion: 1,
      generatedAt: "2026-01-02T03:04:05.000Z",
      selection: "current",
      platform: "linux",
      ok: true,
      helperReady: true,
      ready: true,
      reports: [
        {
          ...fakeReport("linux-uinput", true),
          ready: true,
          helper: {
            path: "/fake/linux-helper",
            status: "available",
            executable: true,
          },
        },
      ],
    });

    expect(output).toContain("OpenController Native Backend Doctor");
    expect(output).toContain("Linux uinput");
    expect(output).toContain("ready: yes");
    expect(output).toContain("fake linux-uinput report");
  });
});

describe("native backend test plan", () => {
  test("creates a Linux dry-run plan with helper options", () => {
    const plan = createNativeTestPlan(
      {
        backend: "linux-uinput",
        "dry-run": true,
        "helper-path": "/tmp/opencontroller-uinput-bridge",
        "device-name": "OpenController Test Gamepad",
        profile: "switch",
        id: "player-test",
        "wait-for-exit-ms": "250",
      },
      "darwin",
    );

    expect(plan).toMatchObject({
      id: "player-test",
      profile: "switch",
      backend: "linux-uinput",
      dryRun: true,
      action: {
        button: "B",
        trigger: "ZR",
      },
      adapterOptions: {
        backend: "linux-uinput",
        waitForExitMs: 250,
        linux: {
          controllerId: "player-test",
          helperPath: "/tmp/opencontroller-uinput-bridge",
          deviceName: "OpenController Test Gamepad",
          dryRun: true,
        },
      },
    });
  });

  test("normalizes Windows aliases for native tests", () => {
    const plan = createNativeTestPlan({
      backend: "vhf",
      "helper-path": "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
    });

    expect(plan.backend).toBe("windows-vhf");
    expect(plan.adapterOptions.windows?.hostBridgePath).toBe(
      "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
    );
    expect(plan.adapterOptions.windows?.controllerId).toBe("native-test");
  });

  test("passes native test controller ids through non-Linux adapters", () => {
    const windowsPlan = createNativeTestPlan({
      backend: "windows-vhf",
      id: "player-2",
    });
    const macosPlan = createNativeTestPlan({
      backend: "macos-driverkit",
      id: "player-3",
    });

    expect(windowsPlan.adapterOptions.windows?.controllerId).toBe("player-2");
    expect(macosPlan.adapterOptions.macos?.controllerId).toBe("player-3");
  });

  test("rejects all-backend native tests", () => {
    expect(() => createNativeTestPlan({ backend: "all" })).toThrow(
      "Native test runs one backend",
    );
  });
});

describe("native backend setup plan", () => {
  test("dispatches Windows setup flags to the VHF package", async () => {
    const seen: unknown[] = [];
    const result = await prepareNativeSetup(
      {
        backend: "windows-vhf",
        output: "./opencontroller-windows-vhf",
        "host-bridge-path":
          "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
        "device-path": "\\\\.\\OpenControllerTestGamepad",
        "report-profile": "playstation",
      },
      {
        platform: "darwin",
        prepareWindows: async (options) => {
          seen.push(options);
          return fakeWindowsSetupPlan;
        },
      },
    );

    expect(result.backend).toBe("windows-vhf");
    expect(result.formatted).toContain("OpenController Windows VHF Setup");
    expect(seen).toEqual([
      {
        platform: "darwin",
        outputDirectory: "./opencontroller-windows-vhf",
        hostBridgePath: "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
        devicePath: "\\\\.\\OpenControllerTestGamepad",
        driver: {
          reportProfile: "playstation",
        },
        hostBridge: {
          reportProfile: "playstation",
        },
      },
    ]);
  });

  test("dispatches Windows Switch report profile setup flags", async () => {
    const seen: unknown[] = [];
    const result = await prepareNativeSetup(
      {
        backend: "windows-vhf",
        "report-profile": "switch",
      },
      {
        platform: "darwin",
        prepareWindows: async (options) => {
          seen.push(options);
          return fakeWindowsSetupPlan;
        },
      },
    );

    expect(result.backend).toBe("windows-vhf");
    expect(seen).toEqual([
      {
        platform: "darwin",
        driver: {
          reportProfile: "switch",
        },
        hostBridge: {
          reportProfile: "switch",
        },
      },
    ]);
  });

  test("dispatches macOS setup flags to the DriverKit package", async () => {
    const seen: unknown[] = [];
    const result = await prepareNativeSetup(
      {
        backend: "macos-driverkit",
        output: "./opencontroller-macos-driverkit",
        "host-bridge-path":
          "/Applications/OpenController.app/Contents/MacOS/OpenControllerDriverKitHostBridge",
        "driver-bundle-id": "com.example.opencontroller.driver",
        "driver-class-name": "ExampleOpenControllerDriver",
        "team-id": "TEAM42",
        "report-profile": "playstation",
      },
      {
        platform: "linux",
        prepareMacos: async (options) => {
          seen.push(options);
          return fakeMacosSetupPlan;
        },
      },
    );

    expect(result.backend).toBe("macos-driverkit");
    expect(result.formatted).toContain("OpenController macOS DriverKit Setup");
    expect(seen).toEqual([
      {
        platform: "linux",
        outputDirectory: "./opencontroller-macos-driverkit",
        hostBridgePath:
          "/Applications/OpenController.app/Contents/MacOS/OpenControllerDriverKitHostBridge",
        bundle: {
          driverBundleIdentifier: "com.example.opencontroller.driver",
          driverClassName: "ExampleOpenControllerDriver",
          teamIdentifier: "TEAM42",
        },
        driver: {
          reportProfile: "playstation",
        },
      },
    ]);
  });

  test("dispatches macOS Switch report profile setup flags", async () => {
    const seen: unknown[] = [];
    const result = await prepareNativeSetup(
      {
        backend: "macos-driverkit",
        "report-profile": "switch",
      },
      {
        platform: "linux",
        prepareMacos: async (options) => {
          seen.push(options);
          return fakeMacosSetupPlan;
        },
      },
    );

    expect(result.backend).toBe("macos-driverkit");
    expect(seen).toEqual([
      {
        platform: "linux",
        driver: {
          reportProfile: "switch",
        },
      },
    ]);
  });

  test("dispatches Linux setup flags to the uinput package", async () => {
    const seen: unknown[] = [];
    const result = await prepareNativeSetup(
      {
        backend: "linux-uinput",
        output: "/tmp/opencontroller-uinput-bridge",
        cc: "clang",
        "udev-group": "input",
      },
      {
        platform: "linux",
        prepareLinux: async (options) => {
          seen.push(options);
          return fakeLinuxSetupPlan;
        },
      },
    );

    expect(result.backend).toBe("linux-uinput");
    expect(result.formatted).toContain("OpenController Linux uinput Setup");
    expect(seen).toEqual([
      {
        platform: "linux",
        outputPath: "/tmp/opencontroller-uinput-bridge",
        cc: "clang",
        udevGroup: "input",
      },
    ]);
  });

  test("rejects all-backend native setup", async () => {
    await expect(prepareNativeSetup({ backend: "all" })).rejects.toThrow(
      "Native setup runs one backend",
    );
  });
});

function fakeReport(
  backend: NativeBackendId,
  ok: boolean,
): NativeBackendReport {
  const label = {
    "linux-uinput": "Linux uinput",
    "windows-virtual-gamepad": "Windows virtual gamepad",
    "macos-driverkit": "macOS DriverKit",
  }[backend];
  const hostPlatform = {
    "linux-uinput": "linux",
    "windows-virtual-gamepad": "win32",
    "macos-driverkit": "darwin",
  }[backend] as NodeJS.Platform;

  return {
    backend,
    label,
    hostPlatform,
    platform: hostPlatform,
    supportedPlatform: true,
    ok,
    recommendations: ok ? ["ready"] : ["not ready"],
    diagnostics: {
      platform: hostPlatform,
      supportedPlatform: true,
      ok,
    },
    formatted: `fake ${backend} report`,
  };
}

const fakeLinuxSetupPlan = {
  platform: "linux",
  helperPath: "/tmp/opencontroller-uinput-bridge",
  udevRules: [],
  doctorCommand: "opencontroller-linux-uinput-doctor --check",
  dryRunCommand:
    "opencontroller bridge --id player-1 | /tmp/opencontroller-uinput-bridge --controller-id player-1 --dry-run",
  bridgeCommand:
    "opencontroller bridge --id player-1 | /tmp/opencontroller-uinput-bridge --controller-id player-1",
} as const;

const fakeWindowsSetupPlan = {
  platform: "win32",
  outputDirectory: "C:\\OpenController\\vhf-kit",
  driverDirectory: "C:\\OpenController\\vhf-kit\\driver",
  hostBridgeDirectory: "C:\\OpenController\\vhf-kit\\host-bridge",
  hostBridgePath: "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
  devicePath: "\\\\.\\OpenControllerVhfGamepad",
  files: ["C:\\OpenController\\vhf-kit\\driver\\OpenControllerVhfGamepad.inf"],
  infPath: "C:\\OpenController\\vhf-kit\\driver\\OpenControllerVhfGamepad.inf",
  driverHeaderPath:
    "C:\\OpenController\\vhf-kit\\driver\\OpenControllerVhfGamepad.h",
  driverSourcePath:
    "C:\\OpenController\\vhf-kit\\driver\\OpenControllerVhfGamepad.c",
  hostBridgeHeaderPath:
    "C:\\OpenController\\vhf-kit\\host-bridge\\OpenControllerVhfHostBridge.h",
  hostBridgeSourcePath:
    "C:\\OpenController\\vhf-kit\\host-bridge\\OpenControllerVhfHostBridge.c",
  readmePath: "C:\\OpenController\\vhf-kit\\README.md",
  installCommand:
    'pnputil /add-driver "C:\\OpenController\\vhf-kit\\driver\\OpenControllerVhfGamepad.inf" /install',
  nativeTestCommand:
    'opencontroller native test --backend windows-vhf --id player-1 --host-bridge-path "C:\\OpenController\\OpenControllerVhfHostBridge.exe"',
} as const;

const fakeMacosSetupPlan = {
  platform: "darwin",
  outputDirectory: "/tmp/opencontroller-macos-driverkit",
  driverDirectory: "/tmp/opencontroller-macos-driverkit/driverkit-extension",
  hostAppDirectory: "/tmp/opencontroller-macos-driverkit/host-app",
  hostBridgePath:
    "/Applications/OpenController.app/Contents/MacOS/OpenControllerDriverKitHostBridge",
  appBundleIdentifier: "com.example.opencontroller.host",
  driverBundleIdentifier: "com.example.opencontroller.driver",
  driverClassName: "ExampleOpenControllerDriver",
  reportProfile: "generic",
  files: ["/tmp/opencontroller-macos-driverkit/driverkit-extension/Info.plist"],
  infoPlistPath:
    "/tmp/opencontroller-macos-driverkit/driverkit-extension/Info.plist",
  driverEntitlementsPath:
    "/tmp/opencontroller-macos-driverkit/driverkit-extension/OpenControllerVirtualGamepad.entitlements",
  hostEntitlementsPath:
    "/tmp/opencontroller-macos-driverkit/host-app/OpenControllerHost.entitlements",
  driverHeaderPath:
    "/tmp/opencontroller-macos-driverkit/driverkit-extension/OpenControllerVirtualGamepadDriver.h",
  driverSourcePath:
    "/tmp/opencontroller-macos-driverkit/driverkit-extension/OpenControllerVirtualGamepadDriver.cpp",
  manifestPath: "/tmp/opencontroller-macos-driverkit/manifest.json",
  readmePath: "/tmp/opencontroller-macos-driverkit/README.md",
  doctorCommand: "opencontroller-macos-driverkit-doctor --check",
  codesignReminder:
    "codesign and notarize the host app and embedded dext with approved DriverKit entitlements",
  activationCheckCommand: "systemextensionsctl list",
  nativeTestCommand:
    "opencontroller native test --backend macos-driverkit --id player-1 --host-bridge-path '/Applications/OpenController.app/Contents/MacOS/OpenControllerDriverKitHostBridge'",
} as const;
