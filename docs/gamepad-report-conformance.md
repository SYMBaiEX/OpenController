# Gamepad profile and report conformance

This matrix describes fields emitted by OpenController's core encoders. It records OpenController logical control mappings and does not establish identical button semantics, glyphs, or behavior in every game.

## Supported gamepad profiles

| Profile | Face controls (south/east/west/north) | Shoulders | Triggers | System and profile controls |
| --- | --- | --- | --- | --- |
| Xbox | A / B / X / Y | LB / RB | LT / RT | BACK, START, GUIDE, LS, RS |
| PlayStation | CROSS / CIRCLE / SQUARE / TRIANGLE; X aliases CROSS, O aliases CIRCLE | L1 / R1 | L2 / R2 | SHARE, OPTIONS, PS, L3, R3, TOUCHPAD; touchpad contacts and motion |
| Switch | B / A / Y / X | L / R | ZL / ZR | MINUS, PLUS, HOME, CAPTURE, LS, RS; motion |
| Generic HID | BUTTON_0 / BUTTON_1 / BUTTON_2 / BUTTON_3; aliases A/B/X/Y | BUTTON_4 / BUTTON_5 | BUTTON_6 / BUTTON_7 | BUTTON_8, BUTTON_9, BUTTON_10, BUTTON_11; four D-pad directions |

All four profiles support four D-pad directions and left/right sticks. The generic HID profile is OpenController's logical generic layout; it does not infer a physical controller's vendor-specific button assignment. It defines no HOME or CAPTURE buttons: BUTTON_10 and BUTTON_11 are left and right stick clicks. The generic HID report can still encode HOME/CAPTURE bits for profiles that map those controls, such as Xbox GUIDE or Switch HOME/CAPTURE.

## Output format coverage

| Report format | Xbox | PlayStation | Switch | Generic HID | Fields and limitations |
| --- | --- | --- | --- | --- | --- |
| XInput | Yes | Yes | Yes | Yes | Face buttons, shoulders, D-pad, stick clicks, four axes, and two triggers after profile-to-universal mapping. Does not carry HOME/CAPTURE/TOUCHPAD, touchpad contacts, or motion. |
| Generic HID gamepad (input report ID 1) | Yes | Yes | Yes | Yes | Same shared face/shoulder/D-pad/stick-click controls, axes, and triggers; HOME and CAPTURE are represented where mapped. TOUCHPAD shares the generic HID CAPTURE bit. Does not carry touchpad contacts or motion. |
| PlayStation extended HID (input report ID 3) | — | Yes | — | — | Shared gamepad fields plus PlayStation touchpad pressed state, up to two contacts, acceleration, gyroscope, and orientation. |
| Switch extended HID (input report ID 4) | — | — | Yes | — | Shared gamepad fields plus acceleration, gyroscope, and orientation. It has no touchpad contact fields. |

A dash means the format is not listed as supported for that profile. The separate HID rumble (output report ID 2) and light (output report ID 5) reports are feedback/output formats, not gamepad input formats in the matrix above.

## Conformance checks

Run from the repository root without a physical controller:

```sh
bun test packages/core/src/__tests__/report-conformance.test.ts
```

The fixture tests drive each profile through the dry-run controller and decode OpenController's own encoded report bytes. Distinct face, shoulder, D-pad, trigger, and axis values make common alias or field swaps visible. Profile-specific fixtures also assert PlayStation touchpad contacts and motion and Switch motion. These results validate the tested OpenController state-to-report paths only. They do not demonstrate SDL, Steam Input, operating system, driver, physical device, or game compatibility.

When adding a profile or changing an alias, update the profile row, add the profile controls and report formats it supports to the matrix, and add a table-driven case to `packages/core/src/__tests__/report-conformance.test.ts`. Assert decoded fields from encoded bytes, including controls that a selected compatibility report intentionally omits. Use values that differ across axes and triggers so swaps cannot pass accidentally.
