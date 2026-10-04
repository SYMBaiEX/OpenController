import { createControllerHub } from "@opencontroller/core";

// Typed counterpart to the Multi-Controller Hubs example in the core README.
const hub = await createControllerHub();

await hub.add({
  id: "player-1",
  profile: "xbox",
  adapter: "dry-run",
});

await hub.add({
  id: "player-2",
  profile: "xbox",
  adapter: "dry-run",
});

await hub.get("player-1").press("A", 80);
await hub.get("player-2").press("B", 80);
// Await every in-flight hub.add() before disconnecting registered controllers.
await hub.disconnectAll();
