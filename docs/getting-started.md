# Getting Started

Install dependencies and run the checks:

```bash
bun install
bun test
bun run build
```

Run the standalone Getting Started dry-run example from the repository root:

```bash
bun run examples/basic-dry-run/getting-started.ts
```

The [runnable source](../examples/basic-dry-run/getting-started.ts) creates a
dry-run controller, applies a button, trigger, and stick state patch, then
neutralizes and disconnects. CI runs this same source and checks its state and
replay output with `bun run check:dry-run-examples`.

Dry-run is the default adapter because it requires no native permissions and
still updates state, safety, and replay logs.

Timed helpers such as `press`, `moveStick`, `trigger`, and `dpad` return to
neutral after their duration. Stateful helpers such as `setButton`, `setStick`,
`setTrigger`, and `setDpad` hold their values until the same control changes or
the controller is neutralized. `setState` applies a partial multi-control patch
as one command, which is useful when an agent emits a complete control decision
for a single frame or planning tick.

When you are ready to target a real OS virtual controller bridge, use the
unified native package:

```ts
import { createController } from "@opencontroller/core";
import { createNativeHostBridgeAdapter } from "@opencontroller/native";

const controller = await createController({
  profile: "xbox",
  adapter: createNativeHostBridgeAdapter(),
  replay: false
});
```

That adapter selects Linux `uinput`, Windows VHF, or macOS DriverKit for the
current host. The native helper/driver still needs to be installed and trusted
outside the TypeScript runtime.
