import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type ControllerAdapter,
  type ControllerState,
  createActionMap,
  createController,
} from "@opencontroller/core";
import { z } from "zod";

const toolArguments = z.object({}).passthrough();

export const actionNames = ["hold_guard", "release_guard"] as const;
export type McpActionName = (typeof actionNames)[number];

export type McpActionResult =
  | { ok: true; action: McpActionName; state: ControllerState }
  | { ok: false; error: { code: string; message: string } };

/** Create the example server. Omitting adapter always selects core's dry-run adapter. */
export async function createMcpControllerExample(adapter?: ControllerAdapter) {
  const controller = await createController({
    profile: "xbox",
    ...(adapter ? { adapter } : { adapter: "dry-run" as const }),
  });
  const actions = createActionMap(controller, {
    hold_guard: [{ type: "setButton", button: "LB", pressed: true }],
    release_guard: [{ type: "setButton", button: "LB", pressed: false }],
  });
  const server = new McpServer({
    name: "opencontroller-mcp-example",
    version: "0.1.0",
  });

  for (const name of actionNames) {
    server.registerTool(
      name,
      {
        description:
          name === "hold_guard"
            ? "Hold the reviewed LB guard action. Accepts no arguments."
            : "Release the reviewed LB guard action. Accepts no arguments.",
        inputSchema: toolArguments,
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async (args) => {
        const keys = Object.keys(args);
        if (keys.length > 0) {
          return toolResult(
            {
              ok: false,
              error: {
                code: "INVALID_ARGUMENTS",
                message: `This tool accepts no arguments; unexpected: ${keys.join(", ")}.`,
              },
            },
            true,
          );
        }

        try {
          if (!actions.has(name)) {
            return toolResult({
              ok: false,
              error: {
                code: "UNKNOWN_ACTION",
                message: "The requested action is not allowlisted.",
              },
            });
          }
          await actions.run(name, { source: "mcp-example" });
          return toolResult({
            ok: true,
            action: name,
            state: controller.getState(),
          });
        } catch {
          // Do not return local exception messages or stack traces to the MCP caller.
          return toolResult(
            {
              ok: false,
              error: {
                code: "ACTION_FAILED",
                message: "The action could not be completed.",
              },
            },
            true,
          );
        }
      },
    );
  }

  let closed = false;
  return {
    server,
    controller,
    async close() {
      if (closed) return;
      closed = true;
      await controller.disconnect();
    },
  };
}

function toolResult(result: McpActionResult, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}

async function main() {
  const example = await createMcpControllerExample();
  const transport = new StdioServerTransport();
  try {
    await example.server.connect(transport);
    await new Promise<void>((resolve) => {
      transport.onclose = resolve;
    });
  } finally {
    await example.server.close();
    await example.close();
  }
}

if (import.meta.main) {
  main().catch(() => {
    // Keep transport errors out of MCP responses; process failure remains visible.
    process.exitCode = 1;
  });
}
