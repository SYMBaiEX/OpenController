import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpControllerExample, type McpActionResult } from "./server";

const example = await createMcpControllerExample();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({
  name: "opencontroller-mcp-smoke",
  version: "0.1.0",
});

try {
  await Promise.all([
    example.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    "hold_guard",
    "release_guard",
  ]);
  assert.equal(JSON.stringify(listed).includes("ControllerCommand"), false);

  const held = await client.callTool({ name: "hold_guard", arguments: {} });
  const heldResult = held.structuredContent as McpActionResult;
  assert.equal(heldResult.ok, true);
  if (heldResult.ok) assert.equal(heldResult.state.buttons.LB, true);

  const malformed = await client.callTool({
    name: "hold_guard",
    arguments: { command: { type: "press", button: "A" } },
  });
  assert.equal(malformed.isError, true);
  assert.deepEqual(malformed.structuredContent, {
    ok: false,
    error: {
      code: "INVALID_ARGUMENTS",
      message: "This tool accepts no arguments; unexpected: command.",
    },
  });
  assert.equal(JSON.stringify(malformed).includes("stack"), false);

  const unknown = await client.callTool({
    name: "unknown_action",
    arguments: {},
  });
  assert.equal(unknown.isError, true);
  assert.equal(JSON.stringify(unknown).includes("stack"), false);

  const released = await client.callTool({
    name: "release_guard",
    arguments: {},
  });
  const releasedResult = released.structuredContent as McpActionResult;
  assert.equal(releasedResult.ok, true);
  if (releasedResult.ok) assert.equal(releasedResult.state.buttons.LB, false);

  console.log(
    "MCP smoke passed: list, invoke, malformed args, unknown tool, dry-run state.",
  );
} finally {
  await client.close();
  await example.server.close();
  await example.close();
}
