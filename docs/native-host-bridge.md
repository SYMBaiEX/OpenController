# Native Host Bridge

`@opencontroller/native` is the one-import SDK path for native virtual
controller backends.

It chooses the platform backend for the current host:

- Linux: `linux-uinput`
- Windows: `windows-vhf`
- macOS: `macos-driverkit`

The package does not install drivers or bypass platform security. It wraps the
native host bridge process after that bridge has been built, installed, and
trusted by the host OS.

## Use The Current Host Backend

```ts
import { createController } from "@opencontroller/core";
import { createNativeHostBridgeAdapter } from "@opencontroller/native";

const controller = await createController({
  id: "player-1",
  profile: "xbox",
  adapter: createNativeHostBridgeAdapter(),
  replay: false
});

await controller.press("A", 80);
await controller.disconnect();
```

`createNativeHostBridgeAdapter()` resolves the current platform, spawns the
matching host bridge helper, streams OpenController native bridge JSONL to its
stdin, sends an `opencontroller.bridge.connect` lifecycle message before the
first state report, and sends a disconnect message before closing the stream.
The connect message carries backend device identity metadata so helpers can
create or select the intended virtual device before input reports arrive.

## Override Backend Paths

```ts
const adapter = createNativeHostBridgeAdapter({
  linux: {
    controllerId: "player-1",
    helperPath: "/usr/local/bin/opencontroller-uinput-bridge",
    deviceName: "OpenController Virtual Gamepad"
  },
  windows: {
    controllerId: "player-1",
    hostBridgePath: "C:\\OpenController\\OpenControllerVhfHostBridge.exe",
    devicePath: "\\\\.\\OpenControllerVhfGamepad"
  },
  macos: {
    controllerId: "player-1",
    hostBridgePath:
      "/Applications/OpenController.app/Contents/MacOS/OpenControllerDriverKitHostBridge",
    driverBundleIdentifier: "com.opencontroller.driverkit.virtual-gamepad",
    device: {
      deviceName: "OpenController Tournament Pad",
      serialNumber: "player-1"
    }
  }
});
```

Backend-specific options are passed to the underlying platform package. Common
native process options such as `env`, `cwd`, `waitForExitMs`, and output hooks
can be passed at the top level.

## Prepare A Native Backend

Use the unified setup command when you want the platform-specific setup workflow
without remembering each package binary:

```bash
opencontroller native setup --backend current
```

The command dispatches to the Linux uinput helper build, Windows VHF setup kit,
or macOS DriverKit setup kit. It writes reviewed setup assets and commands only;
it does not install drivers, sign packages, alter udev rules, activate System
Extensions, or make privileged system changes.

```bash
opencontroller native setup --backend linux-uinput --output ~/.opencontroller/bin/opencontroller-uinput-bridge
opencontroller native setup --backend windows-vhf --output ./opencontroller-windows-vhf
opencontroller native setup --backend macos-driverkit --output ./opencontroller-macos-driverkit
opencontroller native setup --backend windows-vhf --report-profile playstation
opencontroller native setup --backend macos-driverkit --report-profile playstation
opencontroller native setup --backend windows-vhf --report-profile switch
opencontroller native setup --backend macos-driverkit --report-profile switch
```

Use `--report-profile playstation` when generating Windows VHF or macOS
DriverKit kits that should expose OpenController's 47-byte
`hid-playstation-extended` report for touchpad contacts and motion vectors.
Use `--report-profile switch` when generating kits that should expose the
31-byte `hid-switch-extended` profile report for Switch motion vectors. The
generated Windows host bridge verifies the native bridge
`profileHidReportFormat` before accepting profile bytes.

## Smoke Test A Native Bridge

The CLI can send a short button, stick, trigger, and neutral sequence through
the selected native host bridge:

```bash
opencontroller native test --backend current
```

Linux bridge authors can start with dry-run mode before touching `/dev/uinput`:

```bash
opencontroller native test \
  --backend linux-uinput \
  --dry-run \
  --id player-1 \
  --helper-path ~/.opencontroller/bin/opencontroller-uinput-bridge
```

Windows and macOS host bridge paths can be supplied explicitly:

```bash
opencontroller native test \
  --backend windows-vhf \
  --id player-1 \
  --host-bridge-path ./OpenControllerVhfHostBridge.exe
```

The command prints the final controller state and returns a non-zero exit if the
helper process cannot start or exits unsuccessfully.

## Resolve A Target Backend

```ts
import {
  defaultNativeHostBridgePath,
  resolveNativeHostBridgeBackend
} from "@opencontroller/native";

console.log(resolveNativeHostBridgeBackend({ platform: "linux" }));
console.log(defaultNativeHostBridgePath({ backend: "windows-vhf" }));
```

Use this in installers, diagnostics, and agent launchers that need to show the
path OpenController expects before a bridge binary is present.

## Backend Packages

| Backend | Host | Package |
| --- | --- | --- |
| `linux-uinput` | Linux | `@opencontroller/native-linux-uinput` |
| `windows-vhf` | Windows | `@opencontroller/native-windows-virtual-gamepad` |
| `macos-driverkit` | macOS | `@opencontroller/native-macos-driverkit` |

## Readiness Report

`native doctor --json` prints a versioned JSON report (`schemaVersion: 1`) for
automation and support bundles:

```bash
opencontroller native doctor --backend current --json
opencontroller native doctor --backend all --json
```

Each backend report includes the expected helper path and whether it is
available, absent, or inaccessible; platform and prerequisite checks; declared
backend capabilities; requirement statuses; and actionable next steps. The
`capabilities` object describes the SDK adapter's configured protocol support,
not a live check that a driver or virtual device is functioning.

Doctor is read-only. It checks filesystem accessibility and invokes only the
existing platform diagnostic probes. It does not build or install helpers,
load kernel modules, change device permissions, install drivers, elevate,
inspect signing identity, notarize packages, or activate platform extensions.
A `needed` or `unknown` signing, elevation, or activation status is a boundary
of this report, not an automated verdict that the host can satisfy the
requirement. Windows currently checks legacy ViGEmBus state but does not verify
the VHF driver's installed or signed state; macOS checks authoring tools but
not DriverKit approval or activation; Linux checks writable uinput nodes and
reports recommendations for module and access setup.

Consumers should branch on `schemaVersion`, tolerate additional object fields,
and use `nextSteps` for display rather than parsing the human-readable
`formatted` diagnostics. Requirement fields describe matters the CLI does not
attempt to satisfy.
