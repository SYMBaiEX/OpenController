# Replay Logs

Replay logs are JSONL files that record commands, states, host feedback, and
errors.

```ts
const controller = await createController({
  profile: "xbox",
  adapter: "dry-run",
  replay: {
    dir: "replays/session-001",
    source: "agent-runner"
  }
});
```

Directory shape:

```txt
replays/session-001/
  session.json
  events.jsonl
  commands.jsonl
  states.jsonl
  feedback.jsonl
  errors.jsonl
```

`events.jsonl` contains every replay event in timestamp order. The split files
make common review tasks easier:

- `commands.jsonl`: normalized controller commands with before/after state
- `states.jsonl`: full state snapshots, including `status` and `feedback`
- `feedback.jsonl`: host rumble/light output events plus `stateAfter`
- `errors.jsonl`: command processing errors

Error events keep the existing `error` message and optional `command` fields.
They also include available `intent` and `source` values from the failed
command's `CommandContext`. For native JavaScript `Error` values, replay adds
`errorName` and `errorStack` when those properties are available. For other
thrown values, `error` contains a safe string rendering and `errorDetails`
contains a JSON-safe representation; circular references, unreadable values,
and excessive nesting are marked instead of preventing the event from being
written. These details may contain sensitive data if an adapter includes it in
an error message or custom property, so review error content before sharing a
replay.

Older error events with only `error` and `command` remain valid. Replay export
preserves the original event fields, including the optional diagnostic fields.
Replay records failures that reach OpenController's command
boundary; it does not capture game observations or exceptions from external
games and servers that never reach the adapter. Replay does not retry failed
commands.

Inspect a replay:

```bash
opencontroller replay ./replays/session-001/events.jsonl
```

## Export a replay

Export keeps the original event objects intact. JSON output is a streamed JSON
array; CSV uses a stable column order and includes `event_json` on every row so
fields that are not represented by individual columns remain available.
`command`, `stateBefore`, `stateAfter`, `state`, `feedback`, and `data` are
serialized as JSON cells in CSV. Events with fields added by newer versions are
preserved in both JSON and `event_json`.

```bash
# JSON array to stdout (the default format)
opencontroller replay export ./replays/session-001/events.jsonl

# CSV to a file
opencontroller replay export ./replays/session-001/events.jsonl --format csv --output session.csv
```

Use `--output -` to write explicitly to stdout. Blank lines are ignored, and
CRLF input is accepted. Export reads one event at a time, so memory use does not
grow with the replay size. Invalid JSON reports the input path and one-based
line number. The input and output paths must differ.

CSV columns, in order: `timestamp`, `type`, `controllerId`, `profile`, `label`,
`command`, `stateBefore`, `stateAfter`, `state`, `feedback`, `error`, `intent`,
`source`, `data`, and `event_json`. Commas, quotes, and line breaks are escaped
using standard CSV quoting. For spreadsheet safety, CSV cells whose text starts
with `=`, `+`, `-`, or `@`, including after whitespace or control characters,
are prefixed with an apostrophe. This changes only the presentation cell;
`event_json` retains the original event values for lossless import and analysis.
