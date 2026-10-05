# Controller Profiles

Supported profile names:

- `xbox`
- `playstation`
- `switch`
- `generic-hid`
- `keyboard-mouse`

Profiles expose native button names while also mapping to a universal model.
For example, Xbox `A`, PlayStation `CROSS`, and Switch `B` all map to the
universal `SOUTH` face button.

PlayStation aliases are supported:

```ts
await controller.press("X", 100); // resolves to CROSS
await controller.press("O", 100); // resolves to CIRCLE
await controller.dpad("UP_RIGHT", 100); // presses UP and RIGHT together
```

## Keyboard-Mouse Profile Reports

The `keyboard-mouse` profile accepts `KEY_SPACE`, `KEY_ESCAPE`, `KEY_E`,
`KEY_F`, `KEY_W`, `KEY_A`, `KEY_S`, `KEY_D`, `MOUSE_LEFT`,
`MOUSE_RIGHT`, `MOUSE_MIDDLE`, and the four `DPAD_*` directions. Accepted
names are stored in controller state, but only controls with a universal
mapping appear in XInput and generic HID gamepad reports:

| Profile control | Universal control | XInput/HID control | Alias |
| --- | --- | --- | --- |
| `KEY_SPACE` | `SOUTH` | A | `A` |
| `KEY_ESCAPE` | `EAST` | B | `B` |
| `KEY_F` | `WEST` | X | `X` |
| `KEY_E` | `NORTH` | Y | `Y` |
| `MOUSE_RIGHT` | `LEFT_TRIGGER` | Left trigger | `LT` |
| `MOUSE_LEFT` | `RIGHT_TRIGGER` | Right trigger | `RT` |
| `DPAD_UP`, `DPAD_DOWN`, `DPAD_LEFT`, `DPAD_RIGHT` | Corresponding universal D-pad control | Corresponding D-pad direction | — |

`KEY_W`, `KEY_A`, `KEY_S`, `KEY_D`, and `MOUSE_MIDDLE` are accepted into
state but have no universal mapping, so XInput and generic HID gamepad reports
omit them. In this profile, `KEY_*` names do not emit operating-system
keyboard events. Mouse names do not produce screen coordinates, cursor
movement, coordinate clicks, or window targeting. The mapped mouse buttons are
gamepad triggers, not desktop mouse events. Generic HID output is a gamepad
report; host applications determine how, or whether, to consume it.

## Touchpad And Motion

The runtime includes first-class state for PlayStation touchpad input and
PlayStation/Switch motion input:

```ts
await controller.touchpad(
  {
    pressed: true,
    contacts: [{ id: 0, x: 0.5, y: 0.35, pressure: 0.8 }],
  },
  120,
);

await controller.motion({
  acceleration: { x: 0, y: 0, z: 1 },
  gyroscope: { x: 0.1, y: 0, z: 0 },
});
```

Touchpad coordinates and pressure are normalized to `0..1`. Touchpad input is
enabled for the `playstation` profile. Motion input is enabled for
`playstation` and `switch`.

Dry-run and WebSocket adapters can carry these commands and state snapshots.
Native bridge adapters also advertise touchpad and gyro support because
PlayStation state messages include a `hid-playstation-extended` profile HID
payload with packed touch contacts and motion vectors, and Switch state messages
include a `hid-switch-extended` profile HID payload with motion vectors. The
compatibility XInput payload and generic `hid-gamepad` payload still encode the
common gamepad subset, so platform helpers should consume the profile HID
payload when they need those richer channels.
