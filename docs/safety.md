# Safety

OpenController includes safety checks before commands reach an adapter.

Default checks:

- maximum commands per second
- maximum button hold duration
- maximum stick hold duration
- disabled guide and home buttons
- disabled combo list
- D-pad helper commands checked as their underlying `DPAD_*` buttons
- neutral on error
- neutral on disconnect
- repeated input loop detection

Example:

```ts
const controller = await createController({
  profile: "xbox",
  adapter: "dry-run",
  safety: {
    maxCommandsPerSecond: 20,
    maxButtonHoldMs: 1000,
    disabledButtons: ["GUIDE", "START", "DPAD_UP"],
    disabledCombos: [["DPAD_UP", "DPAD_RIGHT"]]
  }
});
```

`controller.dpad("UP_RIGHT")` is treated as the `DPAD_UP` and `DPAD_RIGHT`
buttons for disabled-button, disabled-combo, and hold-duration checks.

Positive-duration `controller.press` calls accept an optional `AbortSignal` in
the options form. If the signal is already aborted, or aborts before the press
reaches the adapter, the press is rejected without dispatch. If the adapter's
press send is already pending, OpenController waits for that adapter promise to
settle. A successful send is followed by one matching release before the call
rejects with `TimedPressAbortError`. The error exposes `abortReason` and `cause`,
and may also expose `pressSendError`, `releaseError`, and
`neutralizationError` when those operations fail. Adapter failures do not
establish whether a host observed a partial input.

Cancellation applies only to positive-duration `press` calls. Zero-duration
presses keep their existing behavior, and cancellation does not release an
already-held zero-duration press. It does not cancel persistent `setButton`
calls or other commands. These guarantees end at the adapter boundary: a
resolved adapter send means only that the adapter call resolved. It does not
prove that an operating system, device, browser, or game received or observed
the press or release.

OpenController should be used for local, controlled, and permissioned environments.
Do not use it for stealth automation or online competitive game automation.
