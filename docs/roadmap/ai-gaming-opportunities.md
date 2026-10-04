# OpenController AI and Gaming Opportunity Goal

**Status:** Cycle 1 is merged to `main` as PRs #1–#4. Cycle 2 issues [#8](https://github.com/SYMBaiEX/OpenController/issues/8) and [#9](https://github.com/SYMBaiEX/OpenController/issues/9) merged in [PR #12](https://github.com/SYMBaiEX/OpenController/pull/12) (`067fc591fe34e7d09cfdfedcf8db48fcd6a7c0d1`) and [PR #13](https://github.com/SYMBaiEX/OpenController/pull/13) (`5f7e6fc7054654f220a6cb45a4c438ae0d9e4ae7`); [#10](https://github.com/SYMBaiEX/OpenController/issues/10) remains deferred. Cycle 3 issue [#14](https://github.com/SYMBaiEX/OpenController/issues/14) merged in [PR #19](https://github.com/SYMBaiEX/OpenController/pull/19) (`f2baa6b297f05c20b065baab196cce8d6a725bdc`); [#15](https://github.com/SYMBaiEX/OpenController/issues/15) remains deferred. Cycle 4 selected issue [#22](https://github.com/SYMBaiEX/OpenController/issues/22) merged in [PR #25](https://github.com/SYMBaiEX/OpenController/pull/25) at `8eb744cf3167dee9838160ab7364ca6c3bc66e5f`; its roadmap closeout is in progress under gate [#23](https://github.com/SYMBaiEX/OpenController/issues/23). Cycle 5 gate [#29](https://github.com/SYMBaiEX/OpenController/issues/29) is blocked by #23 and tracks candidates [#26](https://github.com/SYMBaiEX/OpenController/issues/26)–[#28](https://github.com/SYMBaiEX/OpenController/issues/28). Whole-match regression baselines remain deferred until a stable scenario is demonstrated; Reddit and accessibility source gaps remain open.

## Product goal

Make OpenController dependable when a game or agent needs an OS-visible controller: explain what the host can support, make input failures diagnosable, and let teams reproduce and compare runs. Prioritize native-device readiness and repeatable headless/replay workflows. Keep driver installation, game perception, and game-specific high-level APIs outside the SDK's first delivery.

The goal is grounded in both the repository roadmap and a targeted public-source sweep. The evidence supports concrete compatibility and evaluation friction; it does not establish market-wide prevalence.

## Evidence boundary

### Verified in this repository

| Observation | Source | What it supports |
| --- | --- | --- |
| Signed, installable native device flows and physical host feedback are the next milestone. | [README.md](../../README.md#L150) | Native setup is a first-party product gap. It does not establish how many users are blocked by it. |
| Native setup emits reviewed assets and commands but does not install, sign, change permissions, or activate system extensions. | [native-host-bridge.md](../native-host-bridge.md#L71) | Setup automation has a clear safety boundary. |
| The roadmap calls for stored Agent Fighter regression baselines. | [README.md](../../README.md#L864) | Headless regression work is already in project scope. |
| The roadmap calls for JSON, CSV, and training-friendly replay export. | [README.md](../../README.md#L865) | Replay export is already in project scope. |
| The CLI replay command reports a summary; replay logs already store event streams. | [replay-logs.md](../replay-logs.md#L1) | There is an existing implementation path for practical replay inspection/export. |
| Agent Fighter has a headless match-series runner and quality gates. | [agent-fighter.md](../agent-fighter.md) | Existing evaluation code can support a baseline workflow. |

### External research state

The targeted sweep ran on 2026-10-04 across SDL and Steam for Linux GitHub issues, Steam Community discussions, Factorio Learning Environment reports, Hacker News, and the OpenAI developer forum. It found repeated examples of device-specific mapping/initialization failures, host permission or virtual-device lifecycle friction, and hard-to-reproduce agent-evaluation errors. Treat these as recurring categories in the reviewed sources, not prevalence estimates.

Coverage is incomplete. Reddit endpoints return an HTTP 403 network-security page, so no Reddit posts were reviewed. GamingOnLinux search returned the homepage without results; its latest RSS feed had no relevant controller/gamepad/Steam Input items. Search results were targeted samples, not an exhaustive read of every forum, repository, or historical thread. Thread replies/reactions measure attention to that report, not affected-user counts.

#### Source log

| Source and date | Direct evidence | Observed pain and evidence limits |
| --- | --- | --- |
| SDL issue #16441, 2026-10-04 | [8BitDo Ultimate 2C rejected over Bluetooth](https://github.com/libsdl-org/SDL/issues/16441), 0 comments when checked | A Bluetooth PID not recognized by SDL's 8BitDo driver prevents this device mode from initializing. The report requests the missing PID mapping; no other workaround or recurrence is shown. |
| SDL issue #16434, 2026-10-03 | [GameSir T3s calibration reply length](https://github.com/libsdl-org/SDL/issues/16434), 0 comments | Switch-mode controller is detected on Linux but fails HIDAPI initialization because the calibration reply has a different length. No workaround is stated; this is a specific protocol case. |
| SDL issue #16400, 2026-09-28 | [Steam Controller remains in lizard mode](https://github.com/libsdl-org/SDL/issues/16400), 0 comments | Keyboard/mouse fallback and gamepad events conflict; the report asks SDL to disable the fallback. No workaround is shown. |
| SDL issue #16237, 2026-09-03 | [Betop motion data is NaN in SDL3](https://github.com/libsdl-org/SDL/issues/16237), 4 comments | Buttons/rumble work while gyro/accelerometer data is unusable; the report compares SDL versions and Switch behavior, with no workaround stated. |
| SDL issue #15658, 2026-05-20 | [8BitDo triggers lack analog input](https://github.com/libsdl-org/SDL/issues/15658), 7 comments | SDL/Steam expose non-analog triggers where a browser gamepad tester reports values. Shows API/backend differences for a particular controller, not all devices. |
| Steam for Linux issue #10442, 2024-01-28 | [Wayland asks to allow remote interaction](https://github.com/ValveSoftware/steam-for-linux/issues/10442), 130 comments, 118 reactions | Fedora/GNOME Wayland consent blocks using an Xbox controller as a mouse. The issue suggests granting the portal prompt or using X11. High engagement is not a rate estimate. |
| Steam for Linux issue #13665, 2026-09-29 | [Game Mode recreation silently drops controller input](https://github.com/ValveSoftware/steam-for-linux/issues/13665), 0 comments | Launching an app can recreate Steam Input's virtual gamepad and leave other running apps without input. Recent singleton report; no workaround is stated. |
| Steam for Linux issue #13029, 2026-03-23 | [ASUS HID events reset the Steam virtual gamepad](https://github.com/ValveSoftware/steam-for-linux/issues/13029), 4 comments | Reporter observes input reset across several games after an unrelated device event; one reporter, several affected titles, no documented fix. |
| Sunshine issue #3527, 2025-01-10 (closed 2025-07-29) | [Transition away from ViGEmBus](https://github.com/LizardByte/Sunshine/issues/3527), 10 comments; [WinUHid backend proposal #4948](https://github.com/LizardByte/Sunshine/pull/4948), opened and closed unmerged 2026-04-04 | A Windows streaming user reported Sunshine failed without the legacy ViGEmBus driver and raised concerns about its maintenance. Maintainers said the driver remained required; comments discuss code-signing constraints. A WinUHid alternative was proposed in a PR but closed unmerged. Historical single-project report, not evidence of a current OpenController blocker. |
| Steam Deck discussion, 2026-08-04 | [GameSir G7 Pro rumble missing on SteamOS](https://steamcommunity.com/app/1675200/discussions/1/580552797772062608/), 2 replies | Dongle input works but rumble is lost; switching controller modes did not help, and one commenter reports the same symptom. |
| Steam Deck discussion, 2026-09-26 | [Controller order breaks while docked](https://steamcommunity.com/app/1675200/discussions/1/806848045381749056/), 10 replies | Docked Legion Go S with two Xbox pads reports unusable controller ordering; the author forced a restart but still could not play. One thread, not prevalence data. |
| Steam Deck feature request, 2026-09-30 | [Expose Steam Deck as a Bluetooth controller](https://steamcommunity.com/app/1675200/discussions/2/585061535403037013/), 0 replies | One request for a virtual-controller mode that cites a community project as today's workaround. Low-confidence demand signal. |
| Factorio Learning Environment issue #417, 2026-09-14 | [Client-join blockers and install papercuts](https://github.com/JackHopkins/factorio-learning-environment/issues/417), 1 comment | Agent-evaluation user reports dependency and client-join failures, swallowed errors, and camera/event-handler problems; local patches were the workaround. Strong report detail, one environment. |
| Factorio Learning Environment issue #418, 2026-09-15 | [Agent docs: four code examples cannot run](https://github.com/JackHopkins/factorio-learning-environment/issues/418), 0 comments | Several documented examples fail against a live headless server. The report proposes correcting signatures/docs but gives no working workaround. Single project report, not controller transport specifically. |
| Factorio Learning Environment PR #413, 2026-09-07 | [Retry and error handling for transient observations](https://github.com/JackHopkins/factorio-learning-environment/pull/413), 0 comments | A long evaluation rollout failed on a transient observation error; the underlying cause was hidden and healthy epochs were cancelled. Replaying the same actions succeeded twice; retry/backoff and logging the underlying exception were the fix. This is a merged fix PR, not an open request. |
| OpenAI developer forum, 2026-02-16 | [2D game built with Codex and agent skills](https://community.openai.com/t/show-2d-game-built-using-codex-and-agent-skills-zero-code/1374319), 7 replies | A player could not move with arrows because only WASD was mapped; author added arrow/space mappings. Concrete action-map friction, but a human-player demo rather than an SDK user report. |
| OpenAI developer forum, 2026-09-29 | [Autonomous assistant for PC gamers](https://community.openai.com/t/autonomous-agent-assistant-for-pc-gamers/1402066), 1 reply | One gamer says manual state descriptions and screenshots are cumbersome and asks about temporary controller takeover. Perception/memory interest is outside this SDK's current scope. |
| Hacker News, 2025-03-11 | [Factorio Learning Environment launch](https://news.ycombinator.com/item?id=43331582), 749 points, 209 comments | Strong interest in game-agent benchmarking and long-horizon automation. A launch discussion, not a pain-point survey; the environment exposes high-level game actions rather than a virtual gamepad. |
| Hacker News, 2026-09-11 | [Clawfight agentic game](https://news.ycombinator.com/item?id=49658483), 13 points, 17 comments | Creator says Unreal-based remote control quality was not good enough and describes a near-real-time video approach. The reported quality issue is ambiguous, so fit to controller transport is low. |

#### Cross-source interpretation

| Candidate theme | Evidence and confidence | Product interpretation |
| --- | --- | --- |
| Host permissions, controller identity/mapping, and virtual-device lifecycle | Several distinct SDL and Steam reports across 2024-2026, plus Steam Deck reports. **Moderate confidence** that this is a recurring integration category; prevalence and the fraction OpenController can fix are unknown. | Prioritize clear host/helper readiness output and follow with a compatibility test matrix. SDL or Steam-owned mapping bugs must be fixed upstream. |
| Reproducing failed agent runs and making errors actionable | Three adjacent FLE evaluation reports discuss setup, transient observation failures, hidden errors, and replaying the same sequence. **Moderate confidence** in the workflow friction; one benchmark ecosystem, medium project fit. | Replay export and deterministic baselines are direct, bounded improvements to existing OpenController capabilities. They do not reproduce screenshots or game state the SDK never recorded. |
| Consistent action mapping and broader game control | SDL has device-specific mapping reports; one OpenAI forum game demo needed arrow-key support. **Low-to-moderate confidence**; several examples but different users and layers. | Document normalized action maps and test consumer-visible profiles. Do not claim a universal mapping can repair every title. |
| Screen understanding, memory, and high-level game APIs | One gamer requested these; high-engagement HN game-agent launches use game-domain APIs. Evidence is mixed and mostly adjacent. | Keep perception, model planning, and game-specific integrations optional or out of scope. Many agent environments do not need a controller emulator. |

For each future signal, keep the direct post/issue URL, date, persona and situation, workaround, recurrence indicators, counterexamples, and confidence. Search/result pages alone are not evidence.

## Prioritized opportunity backlog

Rank balances user value, evidence strength, fit to this SDK, implementation cost, and platform/security risk. Confidence describes only the reviewed sources, not market size.

| Rank | Opportunity | User / current workaround | Evidence and confidence | Fit and cost/risk | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Native readiness and visible failure diagnosis | Game/agent developers whose host fails to create or retain an OS-visible gamepad piece together OS, Steam Input, and helper logs. | SDL and Steam reports include [Wayland consent](https://github.com/ValveSoftware/steam-for-linux/issues/10442) and [Steam Input recreation](https://github.com/ValveSoftware/steam-for-linux/issues/13665). Moderate category confidence; upstream driver bugs are outside this SDK's control. | High fit; medium cost, with host-specific and privilege risks. | Implement read-only readiness reporting; game-specific consumption proof is deferred. |
| 2 | Replay export and practical inspection | Agent authors debugging a failed run inspect summaries or write their own JSONL parsers. | [FLE's transient rollout failure](https://github.com/JackHopkins/factorio-learning-environment/pull/413) describes hidden errors and an action sequence that succeeds when replayed. Moderate workflow confidence within one benchmark ecosystem. | High fit; medium cost for schema stability and large files. | Implement streaming JSON/CSV export; it cannot restore screenshots or state the SDK did not record. |
| 3 | Deterministic headless regression baselines | Agent authors/CI maintainers want meaningful behavior regressions beyond checking that actions happened. | FLE reports and HN discussion show evaluation interest; OpenController's own Agent Fighter outcome/decision metrics varied substantially across repeated runs. Moderate user-problem evidence, low current implementation confidence. | High roadmap fit; high cost until simulation and telemetry outcomes stabilize. | Defer capture/comparison until a scenario yields stable metrics beyond the existing liveness gate. |
| 4 | Cross-consumer controller compatibility matrix | Integrators swap modes and test each consumer manually to verify axes, rumble, and motion. | SDL reports device-specific issues; Steam Deck discussions report [missing rumble](https://steamcommunity.com/app/1675200/discussions/1/580552797772062608/) and [broken ordering](https://steamcommunity.com/app/1675200/discussions/1/806848045381749056/). Moderate category confidence; many fixes are upstream. | Medium/high fit; medium/high cost for real hardware/OS coverage. | Follow up with a manual matrix and virtual-profile conformance fixtures. |
| 5 | Reconnect, sleep/resume, and input-loss recovery | Desktop/streaming users restart apps or reconnect devices after virtual-device loss. | Recent [Steam Game Mode](https://github.com/ValveSoftware/steam-for-linux/issues/13665) and [uinput reset](https://github.com/ValveSoftware/steam-for-linux/issues/13029) reports, plus [Sunshine's ViGEm transition](https://github.com/LizardByte/Sunshine/issues/3527). Low-to-moderate confidence. | Medium fit; high cost due ownership, crash, and neutral-state semantics. | Defer API changes; first expose and validate lifecycle signals. |
| 6 | Persistent accessible remapping/calibration | Players currently depend on game, Steam Input, or separate host remappers. | One [OpenAI forum demo needed arrow mappings](https://community.openai.com/t/show-2d-game-built-using-codex-and-agent-skills-zero-code/1374319); Reddit accessibility research was blocked. Low confidence and missing target-community coverage. | Medium fit; medium/high research and persistence cost. | Defer until disabled gamers and accessibility communities are researched directly. |
| 7 | Game perception, memory, and provider-neutral gameplay APIs | PC gamers manually share screenshots/state, while benchmarks often use direct game APIs. | One [forum request](https://community.openai.com/t/autonomous-agent-assistant-for-pc-gamers/1402066) contrasts with high-level APIs in FLE and [MCP-first Clawfight](https://news.ycombinator.com/item?id=49658483). Low/mixed fit evidence. | Low/medium fit; high scope expansion into vision and agent orchestration. | Keep outside SDK core; revisit only for an optional integration with stronger evidence. |

## Build goal and acceptance checklist

### Slice A — deterministic headless regression baseline (deferred)

This slice is not in the current implementation stack. Repeated Agent Fighter
runs varied in decision counts (13, 16, 18, and 34), including a failure beyond
a broad 50% tolerance; repeated 95-second attempts still recorded no completed
rounds. A binary per-player activity baseline would duplicate the existing
minimum-decision quality gate. Do not ship a baseline until the harness records
repeatable, meaningful outcomes beyond that check.

Future acceptance criteria:

- [ ] Identify a deterministic game scenario with meaningful, stable metrics
  across repeated captures.
- [ ] Version policy, simulator, runtime, browser, scenario, and run metadata.
- [ ] Compare configuration fields individually and show expected/observed
  values, deltas, and evidence-based tolerances.
- [ ] Keep external-model runs out of deterministic regression gates.
- [ ] Cover passing, failing, malformed, incompatible, and repeated captures.
- [ ] Document metric scope and limitations.

### Slice B — replay export

- [x] Stream JSON arrays and CSV from JSONL without retaining the whole log.
- [x] Keep stable CSV columns, timestamps, and original event JSON so unknown
  fields survive export.
- [x] Report malformed input with the source path and one-based line number.
- [x] Cover mixed events, empty and CRLF logs, quoting, malformed rows, and
  destination aliases that could truncate the input.
- [x] Document supported formats and the preservation contract.

### Slice C — native readiness diagnostics

- [x] Provide a versioned machine-readable report with timestamp, host/runtime,
  backend support, helper path/status/executable state, requirements,
  capabilities, and actionable next steps.
- [x] Distinguish absent, inaccessible, and non-file helper paths; only report
  available for a usable regular file.
- [x] Represent unsupported-host checks as unknown or not applicable, without
  host-specific signing, elevation, or install instructions for another OS.
- [x] Keep diagnostics read-only and document that driver activation and
  game/Steam consumption are not proven by these probes.
- [x] Add OS-shaped tests and document what cannot be validated on this host.
- [x] Treat signed installers as a separate platform-specific follow-up needing
  signing assets and release/security review.

### Discovery and integration

- [x] Audit repository roadmap, existing implementations, and safety boundaries.
- [x] Search selected public AI/gaming sources and record dated links, engagement, workarounds, confidence, and coverage gaps.
- [x] Re-rank the backlog from observed reports, project fit, cost, and risk; defer weakly supported or upstream-owned work.
- [ ] Revisit accessibility and Reddit-specific pain points if those communities become reachable; current feature slices do not depend on this gap.
- [x] Run focused tests/build/format checks for replay export and native readiness on their owned branches.
- [x] Independently review both slices, resolve findings, and review the fixes.
- [x] Run integrated release checks on the combined feature branches.
- [x] Prepare and merge meaningful stacked PRs in dependency order with evidence, acceptance criteria, and exact validation.

### Integrated review and validation

An independent review identified three issues before integration: readiness
could overstate unverified Windows/macOS driver state, Windows elevation/signing
were presented as known requirements, and CSV cells could trigger spreadsheet
formulas. The feature branches were corrected, and the reviewer confirmed all
three findings resolved with no new blockers. A separate review of the Bun,
TypeScript, and package upgrade found no correctness, security, or CI blockers.

After PRs #1–#4 merged, `bun install --frozen-lockfile` and
`bun run release:check` passed on `main`:

- Biome checked 139 files with no fixes needed; `tsc -b` passed.
- 151 tests passed, with 0 failures and 1,000 assertions.
- All 9 Turbo build targets succeeded.
- `bun audit` found no vulnerabilities in 90 packages.
- Package packing passed for all 7 publishable workspace packages.

Windows VHF driver installation/signing and macOS DriverKit activation are
still not probed by the current native doctor, so their readiness remains
`unknown` when those checks cannot be verified.

## Current work DAG

```mermaid
flowchart TD
  A[Cycle 4 issue #22 implementation] --> B[PR #25 review and checks]
  B --> C[PR #25 merged to main]
  C --> D[Cycle 4 roadmap closeout PR]
  D --> E[Close Cycle 4 gate #23]
  E --> F[Unblock Cycle 5 research gate #29]
  F --> G[Refresh sources and audit current main]
  G --> H[Rank Cycle 5 candidates #26-#28]
  H --> I[Select one bounded issue or record no-build]
  I --> J[Stacked implementation PRs, review, checks, and merge]
  J --> K[Update roadmap and open Cycle 6 gate]
  K --> L[Close Cycle 5 gate #29]
```

The DAG repeats research, repository audit, bounded selection, implementation,
independent review, required checks, merge, and opening the next research gate.
Earlier cycle DAGs below record historical decisions. Coverage gaps and
whole-match nondeterminism remain explicit; seeded local decisions do not prove
stable match outcomes.

## Branch and PR dependency order

Cycle 1's stack was merged to `main` on 2026-10-04:

- [#1](https://github.com/SYMBaiEX/OpenController/pull/1) toolchain/package upgrade — merged first.
- [#2](https://github.com/SYMBaiEX/OpenController/pull/2) research, ranked goal, and checklist — merged after #1.
- [#3](https://github.com/SYMBaiEX/OpenController/pull/3) replay exporter — rebased on the research branch and merged after #2.
- [#4](https://github.com/SYMBaiEX/OpenController/pull/4) native doctor report — rebased onto the updated `main` after #3 and merged last.

The attempted `feat/fighter-regression-baselines` branch was reset to the DAG
parent and excluded because its measurements were not a trustworthy regression
signal. It remains a deferred backlog item.

## Cycle 2 — research decision and closeout

Research gate [#7](https://github.com/SYMBaiEX/OpenController/issues/7) records the decision for umbrella [#5](https://github.com/SYMBaiEX/OpenController/issues/5). The source log below is a targeted sample of dated reports, not a market survey or prevalence estimate. A zero comment/reaction count is only an engagement snapshot. Evidence identifies debugging and conformance failure modes; it does not establish how often OpenController users encounter them. Reddit still returns HTTP 403, so direct disabled-gamer/accessibility community coverage is missing. Hacker News and general source searches were noisy and launch-oriented; enthusiasm is not counted as pain evidence.

### Cycle 2 source log

| Source and date | Direct evidence | What it supports and limits |
| --- | --- | --- |
| [Factorio Learning Environment (FLE) PR #413](https://github.com/JackHopkins/factorio-learning-environment/pull/413), 2026-09-07 (0 comments, 0 reactions at check time) | A long rollout reported a generic observation error after losing the underlying exception; replaying the same action sequence succeeded twice. The fix retained the exception and logged retry attempts. | Agent-run debugging failure and a concrete logging remedy in one benchmark ecosystem. It does not show prevalence; the error originated outside OpenController's adapter. Candidate [#8](https://github.com/SYMBaiEX/OpenController/issues/8) is limited to context attached to OpenController's own command error events. |
| [FLE issue #417](https://github.com/JackHopkins/factorio-learning-environment/issues/417), 2026-09-14 (1 comment, 0 reactions at check time) | `execute` reports the dead RCON client as not connected while silently returning plausible empty results; a separate status path reports “Connected.” The manual workaround was `instance.rcon_client.connect()`. | A second failure mode in the same ecosystem, not independent ecosystem replication. RCON connection truth is outside this SDK's adapter boundary. |
| [SDL issue #16220](https://github.com/libsdl-org/SDL/issues/16220), 2026-08-31; [SDL issue #14829](https://github.com/libsdl-org/SDL/issues/14829), 2026-01-15; [Steam for Linux issue #13492](https://github.com/ValveSoftware/steam-for-linux/issues/13492), 2026-08-06 | Reports cover incorrect axis-to-trigger mapping for a PDP/Switch-style pad (corrected mapping), a non-Xbox controller example-label mismatch, and DualSense touchpad mapping in MK1 (disabling Steam Input was a workaround; reconnect required a game restart). At check time each report had 0 comments/reactions. | These sit at distinct SDL and Steam layers; the small, low-engagement sample is not prevalence evidence. Candidate [#9](https://github.com/SYMBaiEX/OpenController/issues/9) checks only OpenController's own profile-to-report encoder outputs and documents host limits; it cannot fix SDL/Steam behavior. |
| [DualSense Studio issue #2](https://github.com/SafaElmali/dualsense-studio/issues/2), 2026-09-29 | Chrome detected a Bluetooth DualSense while OBS/CEF Gamepad API did not; restarting, recreating, or interacting with the device did not help. The author explicitly requested an external input bridge. | One unconfirmed report, with no prevalence evidence. OpenController's overlay accepts caller-provided state but does not capture physical gamepads. Candidate [#10](https://github.com/SYMBaiEX/OpenController/issues/10) proposes a macOS-first input source with substantial native API and permission cost. |
| [Steam for Linux issue #13665](https://github.com/ValveSoftware/steam-for-linux/issues/13665), 2026-09-29; [issue #13029](https://github.com/ValveSoftware/steam-for-linux/issues/13029), 2026-03-23 | Reports describe Steam Input virtual-device recreation or reset after host/game lifecycle events. | Lower-fit lifecycle theme: the Linux uinput helper neutralizes on disconnect/stream teardown, but the SDK cannot repair upstream Steam/host lifecycle resets. Retain as deferred evidence, not a Cycle 2 build slice. |

### Ranking and decision

1. **Rank 1: [#8 — replay command error context](https://github.com/SYMBaiEX/OpenController/issues/8).** High repository fit and lower implementation cost. Structured error context can improve the SDK-controlled logging boundary. Evidence is concrete but limited to one benchmark ecosystem, and the slice must not claim to fix upstream observation or RCON errors.
2. **Rank 2: [#9 — profile-to-report conformance matrix](https://github.com/SYMBaiEX/OpenController/issues/9).** High repository fit and preventive value. Evidence is indirect because the observed mapping defects are upstream; the slice asserts correctness of OpenController's own encoder outputs and documents consumer/host limitations. It does not repair SDL or Steam.
3. **Defer as exploratory: [#10 — macOS physical gamepad input for OBS](https://github.com/SYMBaiEX/OpenController/issues/10).** One report motivates exploration, but independent reports and macOS API/permission feasibility are needed before implementation selection.

Lifecycle recovery remains deferred because ownership is largely upstream. Accessibility/remapping remains deferred until direct target-community research is available. Game perception remains outside the SDK's current scope and has weak fit evidence. This targeted sample supports bounded implementation hypotheses; it cannot estimate market prevalence or establish that these are the most common user problems.

```mermaid
flowchart TD
  R[Research decision: issue #7] --> A[#8 replay command error context]
  R --> B[#9 profile-to-report conformance matrix]
  R -. exploratory, deferred .-> C[#10 macOS physical gamepad input for OBS]
  A --> D[Independent review and integration]
  B --> D
  D --> E[PR #12 and PR #13 merged to main]
  E --> F[Cycle 3 research gate: issue #16]
```

**Implementation closeout:** research PR #11 recorded the gate for the two independent feature slices. Issue #8 was implemented and merged by [PR #12](https://github.com/SYMBaiEX/OpenController/pull/12) at merge commit `067fc591fe34e7d09cfdfedcf8db48fcd6a7c0d1`; issue #9 was implemented and merged by [PR #13](https://github.com/SYMBaiEX/OpenController/pull/13) at merge commit `5f7e6fc7054654f220a6cb45a4c438ae0d9e4ae7`. The PRs were merged to `main`; issue #10 remains deferred pending stronger direct evidence and API/permission feasibility review.

Post-merge validation on the combined `main` state: lint checked 140 files; typecheck passed; 162 tests passed with 0 failures and 1,170 assertions; all 9 Turbo build tasks succeeded; audit checked 90 packages with no vulnerabilities; package packing passed for all 7 publishable workspace packages. These checks validate repository behavior and packaging, not SDL/Steam, host/driver, physical-device, or game behavior described in the source evidence.

The Cycle 2 source log remains a targeted sample, not a market survey or prevalence estimate. Its Reddit/accessibility coverage gaps and upstream ownership limits remain in force.

## Cycle 3 — research decision (2026-10-04)

The research and ranking gate in [issue #16](https://github.com/SYMBaiEX/OpenController/issues/16) selected [#14 — keep key SDK documentation examples runnable](https://github.com/SYMBaiEX/OpenController/issues/14) for a bounded, preventive CI-integrity slice, and deferred [#15 — make Agent Fighter keyboard bindings configurable](https://github.com/SYMBaiEX/OpenController/issues/15) outside the active milestone. PR #19 implemented the selected slice and merged it to `main`.

### Refreshed evidence and limits

The dated public reports below informed the gate. They are targeted examples, not a survey or prevalence estimate; reports from another project do not establish a defect or demand in OpenController.

| Source and date | Direct evidence | Interpretation and limits |
| --- | --- | --- |
| [Factorio Learning Environment issue #418](https://github.com/JackHopkins/factorio-learning-environment/issues/418), 2026-09-15 | A reporter said four documented agent API examples failed against a live headless server; no working workaround was recorded. | Concrete documentation failure in another project. It does not show that OpenController examples are stale. It supports checking the validity of examples that this repository owns. |
| [Accessible-Chess issue #5](https://github.com/Oleksii-debug/Accessible-Chess/issues/5), 2026-08-14 | Requests app-owned remappable shortcuts and command aliases, conflict warnings, and keyboard-only recovery/reset. | Accessibility-focused evidence from another product. Its 20 comments include owner status and implementation updates, not 20 independent confirmations; it does not establish Agent Fighter demand. |
| [Hacker News comment #48624304](https://news.ycombinator.com/item?id=48624304), 2026-06-22, discussing an [OpenAssistiveTech article](https://www.openassistivetech.org/how-i-actually-play-video-games-with-sma-the-tools-i-use-every-day/) dated 2026-06-18 | The commenter recounts a friend with a broken arm being banned for third-party keyboard-remapping software while trying to play one-handed. | Indirect single anecdote about third-party remapping policy, not a request for app-owned controls or evidence about Agent Fighter. The article fetch returned HTTP 403; only the comment was reviewed. |
| [OpenAI developer forum demo thread](https://community.openai.com/t/show-2d-game-built-using-codex-and-agent-skills-zero-code/1374319), 2026-02-16 | A player could not move with arrows because that demo mapped only WASD; the author added arrow and space mappings. | One report about a different demo. Agent Fighter already supports arrow-key movement for player two, so this is not evidence of the same defect here. |

Coverage is incomplete: Reddit search and DuckDuckGo returned HTTP 403 on 2026-10-04, and Steam Community search returned a generic page without a useful dated result. The assistive-gaming article also returned HTTP 403. The accessible reports concern other projects or products; no direct accessibility evidence about Agent Fighter was found. The sweep is targeted and cannot estimate prevalence.

### Repository audit and selection

The audit inspected `main` at `ba0529e`, onboarding docs, example entry points, root scripts, and CI. The Getting Started dry-run flow and AI Agent Integration action-map/state-patch snippets are not executed by tests. Root tests cover package suites, not docs snippets or example packages; `examples/basic-dry-run/index.ts` is runnable but has no test or build script. Agent Fighter has a Playwright headless match runner and quality gates, but they do not execute SDK docs or validate keyboard remapping. Player two already has arrow-key movement; `R` resets and `F` toggles fullscreen. The verified gap is missing executable documentation coverage, not a confirmed stale OpenController snippet.

**Selected: #14, preventive CI integrity.** Exercise shared sources for the Getting Started dry-run path, one AI action-map/state-patch path, and the basic dry-run example. Assert observable state, action, or replay behavior. The slice should need no API key, device, OS permission, or live game; it should not claim to verify native, OBS, game, or hardware behavior. Estimated effort is low to medium (1–2 days).

**Deferred: #15.** The accessibility evidence supports remapping as a concern in other products but does not identify an Agent Fighter problem, and its second player already supports arrows. A configurable UI also requires persistence, conflict handling, recovery, and browser testing (estimated 2–4 days), while browser/OS shortcut detection is incomplete. Revisit if stronger direct fit or evidence emerges.

```mermaid
flowchart TD
  A[Refresh dated evidence and record coverage limits] --> C[Cycle 3 gate #16 selects bounded work]
  B[Audit current repository behavior and test coverage] --> C
  C --> D[Implement issue #14: executable dry-run documentation checks]
  D --> E[Independent review and focused/integrated validation]
  E --> F[PR #19 merged to main]
  F --> G[Update roadmap and open Cycle 4 gate #23]
  G --> H[Close Cycle 3 gate #16]
  H --> I[Unblock Cycle 4 research gate #23]
  C -. deferred outside active milestone .-> J[Issue #15: configurable Agent Fighter keyboard bindings]
```

### Cycle 3 implementation closeout (2026-10-04)

PR [#19](https://github.com/SYMBaiEX/OpenController/pull/19) merged as merge commit `f2baa6b297f05c20b065baab196cce8d6a725bdc`; GitHub closed issue #14. The Getting Started dry-run and AI action-map docs now link to the same runnable TypeScript sources that CI executes. The check also covers the basic dry-run example, observable state and replay intents, neutralization, and disconnect. A dedicated TypeScript project brings all of these examples into the root `tsc -b` check. Default replay output uses a unique directory per run.

An independent review caught the fixed-directory replay append issue and the missing TypeScript project coverage before merge; both were corrected. The final review found no blocker. The automated coverage validates the SDK dry-run path only; it does not validate native drivers, OBS, physical hardware, operating systems, Steam, or game behavior.

Integrated validation on `main` after the merge passed: Biome checked 144 files; TypeScript project build passed; 162 tests passed with 0 failures and 1,170 assertions; all 9 Turbo build targets succeeded; audit found no vulnerabilities in 90 packages; package packing passed for all 7 publishable packages; `check:dry-run-examples` passed; and `git diff --check` passed. Issue #15 remains deferred.

### Cycle 4 closeout and Cycle 5 research gate

Cycle 4 research gate [#23](https://github.com/SYMBaiEX/OpenController/issues/23) selected [#22 — seed Agent Fighter local decisions](https://github.com/SYMBaiEX/OpenController/issues/22). The issue's code audit found unseeded `Math.random()` branches in the local policy and no runner seed input or output metadata. Adjacent game-agent benchmark requests motivated investigation but do not establish OpenController user prevalence. Candidates [#20](https://github.com/SYMBaiEX/OpenController/issues/20) (native-test failure cleanup) and [#21](https://github.com/SYMBaiEX/OpenController/issues/21) (host/game compatibility evidence) remain deferred; #10 and #15 also remain deferred.

Implementation PR [#25](https://github.com/SYMBaiEX/OpenController/pull/25) merged to `main` at `8eb744cf3167dee9838160ab7364ca6c3bc66e5f`; GitHub closed issue #22. The server now uses per-player `mulberry32-v1` streams only for randomized local-policy choices, and the headless runner accepts `--seed <uint32>` for a server it starts. Telemetry and JSON summaries report the seed and scope when controlled by the runner; external-server runs do not claim an unknown seed. The change makes identical local decisions repeat for the same seed and observation sequence; it does not make browser-driven full matches deterministic and excludes provider responses.

PR #25 passed CI and received an independent gpt-6-luna agent review that found no blocker. GitHub has no substantive review record: Copilot could not review because of its quota limit, and CodeRabbit was still pending at merge. `bun run release:check` passed: 166 tests, zero failures, typecheck, all 9 build tasks, audit with no vulnerabilities, and package checks. A seeded headless smoke run with seed 42 reported matching server and summary metadata and 16 local decisions. The Playwright CDN returned HTTP 403, so the smoke used the existing system Chromium. These checks validate SDK-controlled policy behavior and packaging, not external game, host, or hardware behavior.

Cycle 4 closes only after this roadmap update merges and gate #23 is closed. Candidate backlog for Cycle 5 is tracked in milestone 4: [#26 — user-run browser hardware routing check](https://github.com/SYMBaiEX/OpenController/issues/26), [#27 — multi-controller slot ownership and recovery](https://github.com/SYMBaiEX/OpenController/issues/27), and [#28 — input latency at explicit SDK boundaries](https://github.com/SYMBaiEX/OpenController/issues/28). The dated sources are adjacent single-project reports: [Tanks #616](https://github.com/AustinOrphan/tanks/issues/616) (2026-09-08), [Selkies #431](https://github.com/selkies-project/selkies/issues/431) (2026-09-29), [PortareOS #436](https://github.com/portare-ch/portareos/issues/436) (2026-09-29), [DuelBox-Web #133](https://github.com/swiftSaneGames/DuelBox-Web/issues/133) (2026-08-19), and the [Chrome Gamepad event-driven proposal #1313](https://github.com/GoogleChrome/modern-web-guidance-src/issues/1313) (2026-08-14). They seed investigation and do not indicate prevalence or OpenController defects. The new research gate must refresh broader communities, verify current repository fit, and rank or reject these candidates.

Cycle 5 research gate [#29](https://github.com/SYMBaiEX/OpenController/issues/29) is blocked by #23. Once unblocked, it will re-rank #26–#28 against refreshed evidence and current `main`, select one bounded slice or a no-build decision, then require independent implementation review, checks, merge, roadmap update, and a Cycle 6 gate before closing.

**GitHub Projects tracking:** project creation was retried during this cycle and GitHub again returned `Resource not accessible by integration` for `createProjectV2`. No Project V2 exists. Milestones and the native issue dependency graph are the current tracker until the connected GitHub integration has Projects write permission.

## Branch and swarm operating rules


- Each implementation agent owns one named branch and worktree; do not edit the
  same package or roadmap checklist from multiple worktrees.
- Fetch `origin` before starting, at integration checkpoints, and before final
  validation. Rebase only onto the declared parent branch and resolve conflicts
  immediately.
- Commit each coherent, reviewable step; do not split commits artificially.
- PR description records the user problem, source evidence state, acceptance
  criteria, dependency/base branch, and exact validation results.
- Keep the Reddit/accessibility coverage gaps and the baseline nondeterminism
  evidence visible; revisit them before starting deferred work.
