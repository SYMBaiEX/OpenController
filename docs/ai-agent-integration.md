# AI Agent Integration

Agents can use raw commands:

```ts
await controller.press("A", 100);
await controller.moveStick("LEFT", { x: 0, y: -1 }, 300);
```

Timed commands are best for taps, nudges, and short analog pulls. For controls
that should remain held across multiple agent decisions, use the stateful
helpers:

```ts
await controller.setButton("LB", true);
await controller.setStick("LEFT", { x: 0.6, y: -0.25 });
await controller.setTrigger("RT", 0.4);
await controller.setDpad("UP_RIGHT");

// Release only what changed, or call neutral() to reset everything.
await controller.setDpad("NEUTRAL");
await controller.setButton("LB", false);
```

For frame-style policies, use one atomic state patch:

```ts
await controller.setState({
  buttons: { LB: true, A: false },
  triggers: { RT: 0.35 },
  sticks: { LEFT: { x: 0.5, y: -0.2 } },
  dpad: "NEUTRAL"
});
```

The patch is partial: controls not listed keep their current state. The runtime
still performs profile normalization, safety checks, replay logging, and one
adapter state-sync message.

For safer model-facing control, use named action maps. The runnable
[semantic binding example](../examples/basic-dry-run/ai-agent-integration.ts)
defines stable action IDs (`moveLeft`, `moveRight`, and `confirm`) separately
from caller-owned source identifiers. It supplies two binding sets: one for
WASD-style identifiers and one for arrow/Enter identifiers. Both route to the
same `createActionMap`, which defines the OpenController commands for those
semantic actions.

The consuming application owns input events and passes a source identifier to
its selected binding set. The example validates the full set first, rejecting
unknown semantic actions and duplicate source identifiers before creating or
commanding a controller. It then resolves the source identifier and dispatches
the mapped semantic action. OpenController does not capture keyboard or
physical gamepad input, change OS or Steam remapping, or provide a settings UI
or persistent user profile. The consuming application still owns its input
capture, conflict policy, persistence, and recovery experience.

Run both binding sets from the repository root:

```bash
bun run examples/basic-dry-run/ai-agent-integration.ts
```

The dry-run smoke check covers both valid sets and invalid unknown/conflicting
bindings with `bun run check:dry-run-examples`. It verifies OpenController
commands and dry-run state only; it does not establish host, browser, Steam,
physical device, or game input behavior. Action maps keep model output
constrained to named, reviewed behaviors.
