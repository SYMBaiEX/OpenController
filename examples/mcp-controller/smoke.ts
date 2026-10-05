import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  type ControllerAdapter,
  createAdapterCapabilities,
} from "@opencontroller/core";
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
  try {
    await client.close();
  } finally {
    try {
      await example.server.close();
    } finally {
      await example.close();
    }
  }
}

const adapterFailureMessage = "private adapter failure detail";
let failingAdapterDisconnected = false;
const failingAdapter: ControllerAdapter = {
  name: "failing-smoke-adapter",
  platform: "all",
  async connect() {},
  async send() {
    throw new Error(adapterFailureMessage);
  },
  async neutral() {},
  async disconnect() {
    failingAdapterDisconnected = true;
  },
  capabilities: () => createAdapterCapabilities(),
};
const failingExample = await createMcpControllerExample(failingAdapter);
const [failureClientTransport, failureServerTransport] =
  InMemoryTransport.createLinkedPair();
const failureClient = new Client({
  name: "opencontroller-mcp-failure-smoke",
  version: "0.1.0",
});

try {
  await Promise.all([
    failingExample.server.connect(failureServerTransport),
    failureClient.connect(failureClientTransport),
  ]);

  const failed = await failureClient.callTool({
    name: "hold_guard",
    arguments: {},
  });
  assert.equal(failed.isError, true);
  assert.deepEqual(failed.structuredContent, {
    ok: false,
    error: {
      code: "ACTION_FAILED",
      message: "The action could not be completed.",
    },
  });
  const failedPayload = JSON.stringify(failed);
  assert.equal(failedPayload.includes(adapterFailureMessage), false);
  assert.equal(failedPayload.includes("stack"), false);
} finally {
  try {
    await failureClient.close();
  } finally {
    try {
      await failingExample.server.close();
    } finally {
      await failingExample.close();
    }
  }
}
assert.equal(failingAdapterDisconnected, true);

console.log("MCP smoke passed: sanitized adapter failures and cleanup.");
