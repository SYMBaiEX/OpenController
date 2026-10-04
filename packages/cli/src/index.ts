#!/usr/bin/env bun
import { bridgeCommand } from "./commands/bridge";
import { doctorCommand } from "./commands/doctor";
import { initCommand } from "./commands/init";
import { nativeCommand } from "./commands/native";
import { overlayCommand } from "./commands/overlay";
import { replayCommand } from "./commands/replay";
import { testCommand } from "./commands/test";

type Flags = Record<string, string | boolean>;

async function main(argv: string[]): Promise<void> {
  const [command = "help", ...rest] = argv;
  const flags = parseFlags(rest);

  switch (command) {
    case "init":
      await initCommand();
      return;
    case "doctor":
      await doctorCommand();
      return;
    case "test":
      await testCommand({
        ...defined(
          "profile",
          parseChoice(flags.profile, "profile", [
            "xbox",
            "playstation",
            "switch",
            "generic-hid",
            "keyboard-mouse",
          ] as const),
        ),
        ...defined(
          "adapter",
          parseChoice(flags.adapter, "adapter", [
            "dry-run",
            "websocket",
            "xinput-report",
            "hid-gamepad-report",
            "hid-playstation-extended-report",
            "hid-switch-extended-report",
            "native-bridge",
          ] as const),
        ),
        ...defined("url", optionalStringFlag(flags.url, "url")),
      });
      return;
    case "overlay":
      await overlayCommand({
        ...defined(
          "profile",
          parseChoice(flags.profile, "profile", [
            "xbox",
            "playstation",
            "switch",
            "generic-hid",
          ] as const),
        ),
        ...defined("port", optionalStringFlag(flags.port, "port")),
        ...defined(
          "theme",
          parseChoice(flags.theme, "theme", [
            "default",
            "dark",
            "light",
            "neon",
            "transparent",
          ] as const),
        ),
      });
      return;
    case "replay":
      await replayCommand(rest.find((arg) => !arg.startsWith("--")));
      return;
    case "adapters":
      await doctorCommand();
      return;
    case "bridge":
      await bridgeCommand(defined("id", optionalStringFlag(flags.id, "id")));
      return;
    case "native":
      await nativeCommand(rest, flags);
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      continue;
    }
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[rawKey] = next;
      index += 1;
    } else {
      flags[rawKey] = true;
    }
  }

  return flags;
}

function parseChoice<const TChoices extends readonly string[]>(
  value: string | boolean | undefined,
  flag: string,
  choices: TChoices,
): TChoices[number] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new Error(
      `Invalid --${flag}; expected one of: ${choices.join(", ")}`,
    );
  }
  return value;
}

function optionalStringFlag(
  value: string | boolean | undefined,
  flag: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`--${flag} requires a value`);
  }
  return value;
}

function defined<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): { [K in TKey]?: TValue } {
  return value === undefined
    ? {}
    : ({ [key]: value } as { [K in TKey]?: TValue });
}

function printHelp(): void {
  console.log(`OpenController CLI

Usage:
  opencontroller init
  opencontroller doctor
  opencontroller test --profile xbox --adapter dry-run
  opencontroller overlay --profile xbox --port 4317
  opencontroller replay ./replays/session/events.jsonl
  opencontroller bridge --id player-1
  opencontroller native doctor --backend current
  opencontroller native setup --backend current
  opencontroller native test --backend linux-uinput --dry-run --id player-1
  opencontroller adapters
`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
