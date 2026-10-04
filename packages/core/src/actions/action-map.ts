import type { Controller } from "../controller";
import type { CommandContext, ControllerCommand } from "../types";

export type ActionMapDefinition = Record<string, readonly ControllerCommand[]>;
export type ActionNames<TDefinition extends ActionMapDefinition> =
  keyof TDefinition & string;

export type ActionRunOptions = CommandContext & {
  durationMs?: number;
};

export type ActionMap<
  TDefinition extends ActionMapDefinition = ActionMapDefinition,
> = {
  run(
    actionName: keyof TDefinition & string,
    options?: ActionRunOptions,
  ): Promise<void>;
  list(): Array<ActionNames<TDefinition>>;
  has(actionName: string): actionName is ActionNames<TDefinition>;
};

export function createActionMap<const TDefinition extends ActionMapDefinition>(
  controller: Controller,
  definition: TDefinition,
): ActionMap<TDefinition> {
  return {
    async run(actionName, options = {}) {
      const commands = definition[actionName];
      if (!commands) {
        throw new Error(`Unknown action: ${actionName}`);
      }

      const durationMs = options.durationMs;
      const resolved =
        durationMs !== undefined
          ? commands.map((command) => applyDuration(command, durationMs))
          : [...commands];

      await controller.sequence(resolved, {
        intent: options.intent ?? actionName,
        source: options.source ?? "action-map",
      });
    },
    list(): Array<ActionNames<TDefinition>> {
      return Object.keys(definition) as Array<ActionNames<TDefinition>>;
    },
    has(actionName): actionName is ActionNames<TDefinition> {
      return Object.hasOwn(definition, actionName);
    },
  };
}

function applyDuration(
  command: ControllerCommand,
  durationMs: number,
): ControllerCommand {
  switch (command.type) {
    case "press":
    case "stick":
    case "trigger":
    case "touchpad":
    case "motion":
    case "dpad":
    case "combo":
      return {
        ...command,
        durationMs,
      };
    case "sequence":
      return {
        ...command,
        commands: command.commands.map((child) =>
          applyDuration(child, durationMs),
        ),
      };
    case "release":
    case "setButton":
    case "setStick":
    case "setTrigger":
    case "setDpad":
    case "setState":
    case "setStatus":
    case "wait":
    case "neutral":
      return command;
  }
}
