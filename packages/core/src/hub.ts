import { type Controller, createController } from "./controller";
import type { CreateControllerOptions } from "./types";

export type ControllerHubEntry = CreateControllerOptions & {
  id: string;
};

export type ControllerHubOptions = {
  controllers?: ControllerHubEntry[];
};

export class ControllerHubDisconnectAllError extends Error {
  readonly failuresById: Readonly<Record<string, unknown>>;

  constructor(failuresById: Record<string, unknown>) {
    super("Failed to disconnect one or more controllers");
    this.name = "ControllerHubDisconnectAllError";
    this.failuresById = Object.freeze(
      Object.fromEntries(Object.entries(failuresById)),
    );
  }
}

export class ControllerHub {
  private readonly controllers = new Map<string, Controller>();
  private readonly pendingIds = new Set<string>();

  async add(options: ControllerHubEntry): Promise<Controller> {
    if (this.controllers.has(options.id) || this.pendingIds.has(options.id)) {
      throw new Error(`Controller ${options.id} already exists`);
    }

    this.pendingIds.add(options.id);
    try {
      const controller = await createController(options);
      this.controllers.set(options.id, controller);
      return controller;
    } finally {
      this.pendingIds.delete(options.id);
    }
  }

  get(id: string): Controller {
    const controller = this.controllers.get(id);
    if (!controller) {
      throw new Error(`Controller ${id} does not exist`);
    }
    return controller;
  }

  has(id: string): boolean {
    return this.controllers.has(id);
  }

  list(): string[] {
    return [...this.controllers.keys()];
  }

  states() {
    return Object.fromEntries(
      [...this.controllers.entries()].map(([id, controller]) => [
        id,
        controller.getState(),
      ]),
    );
  }

  async disconnectAll(): Promise<void> {
    const snapshot = [...this.controllers.entries()];
    const results = await Promise.allSettled(
      snapshot.map(([, controller]) => controller.disconnect()),
    );
    const failuresById = Object.create(null) as Record<string, unknown>;

    for (let index = 0; index < snapshot.length; index += 1) {
      const entry = snapshot[index];
      const result = results[index];
      if (!entry || !result) {
        continue;
      }
      const [id] = entry;
      if (result.status === "fulfilled") {
        this.controllers.delete(id);
      } else {
        failuresById[id] = result.reason;
      }
    }

    if (Object.keys(failuresById).length > 0) {
      throw new ControllerHubDisconnectAllError(failuresById);
    }
  }
}

export async function createControllerHub(
  options: ControllerHubOptions = {},
): Promise<ControllerHub> {
  const hub = new ControllerHub();
  for (const controller of options.controllers ?? []) {
    await hub.add(controller);
  }
  return hub;
}
