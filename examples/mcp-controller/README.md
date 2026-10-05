# OpenController MCP example

This runnable MCP server exposes two reviewed tools backed by an OpenController
action map: `hold_guard` and `release_guard`. The tool names and commands are
defined in the example; the MCP caller cannot submit arbitrary controller
commands. Both tools accept no arguments, and extra fields return a structured
`INVALID_ARGUMENTS` error. Unknown tools are rejected by the MCP server.

## Run

From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd examples/mcp-controller dev
```

The server uses the stdio MCP transport and defaults to the core dry-run
adapter. It requires no credentials, game, native driver, or connected device.
The caller should close the MCP session cleanly; the example waits for stdio to
close, then closes the MCP server and disconnects its controller in `finally`.

## Explicit adapter opt-in

To use a host adapter, the embedding application must construct and pass an
already configured `ControllerAdapter` to `createMcpControllerExample(adapter)`.
For example, an embedding application can create a WebSocket adapter with its
own URL and lifecycle, then pass it to this factory. The example does not read
adapter selection from MCP arguments or silently create a native adapter. The
caller configures the adapter, and the example's `close()` disconnects the
controller and invokes the adapter's disconnect lifecycle.

```ts
import { WebSocketAdapter } from "@opencontroller/core";
import { createMcpControllerExample } from "./server";

const adapter = new WebSocketAdapter({ url: process.env.CONTROLLER_WS_URL! });
const example = await createMcpControllerExample(adapter);
try {
  // Connect example.server to the transport selected by your host.
} finally {
  await example.server.close();
  await example.close();
}
```

The application is responsible for validating its own adapter configuration
before opting in. MCP tool success confirms that this example's SDK path
completed an action. It does not confirm that a host, operating system, game,
window, or physical device consumed the input.

## Smoke check

```sh
bun run --cwd examples/mcp-controller smoke
bun run --cwd examples/mcp-controller typecheck
```

The package smoke uses the official SDK's in-memory client/server transport to
list tools, invoke actions, reject malformed arguments and an unknown tool, and
inspect the resulting dry-run controller state.
