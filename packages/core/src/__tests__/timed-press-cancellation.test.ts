import { describe, expect, test } from "bun:test";
import {
  type ControllerAdapter,
  type ControllerState,
  createAdapterCapabilities,
  createController,
  type NormalizedControllerCommand,
  TimedPressAbortError,
} from "../index";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class ControlledAdapter implements ControllerAdapter {
  readonly name = "controlled-test";
  readonly platform = "all" as const;
  readonly history: NormalizedControllerCommand[] = [];
  neutralCalls = 0;
  sendBehavior?: (command: NormalizedControllerCommand) => Promise<void>;
  syncStateBehavior?: (state: ControllerState) => Promise<void>;
  neutralBehavior?: () => Promise<void>;

  async connect(): Promise<void> {}

  async send(command: NormalizedControllerCommand): Promise<void> {
    this.history.push(command);
    await this.sendBehavior?.(command);
  }

  async syncState(state: ControllerState): Promise<void> {
    await this.syncStateBehavior?.(state);
  }

  async neutral(): Promise<void> {
    this.neutralCalls += 1;
    await this.neutralBehavior?.();
  }

  async disconnect(): Promise<void> {}

  capabilities() {
    return createAdapterCapabilities();
  }
}

async function makeController(
  adapter: ControlledAdapter,
  neutralOnError = false,
) {
  return createController({
    profile: "xbox",
    adapter,
    replay: false,
    safety: { neutralOnError, neutralOnDisconnect: false },
  });
}

describe("positive-duration press cancellation", () => {
  test("rejects an already-aborted call before queueing or contacting the adapter", async () => {
    const adapter = new ControlledAdapter();
    const controller = await makeController(adapter);
    const aborter = new AbortController();
    const reason = new Error("task cancelled");
    aborter.abort(reason);

    const error = await controller
      .press("A", { durationMs: 25, signal: aborter.signal })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({ abortReason: reason, cause: reason });
    expect(adapter.history).toHaveLength(0);
    expect(adapter.neutralCalls).toBe(0);
    await controller.disconnect();
  });

  test("rechecks an aborted signal when its queued command reaches the queue", async () => {
    const adapter = new ControlledAdapter();
    const firstSend = deferred();
    const entered = deferred();
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "setButton") {
        entered.resolve();
        await firstSend.promise;
      }
    };
    const controller = await makeController(adapter);
    const first = controller.setButton("B", true);
    await entered.promise;

    const aborter = new AbortController();
    const reason = "stale target";
    const queued = controller.press("A", {
      durationMs: 25,
      signal: aborter.signal,
    });
    aborter.abort(reason);
    firstSend.resolve();
    await first;

    const error = await queued.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({ abortReason: reason, cause: reason });
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "setButton",
    ]);
    expect(adapter.neutralCalls).toBe(0);
    await controller.disconnect();
  });

  test("waits for a pending press send, then releases once before rejecting", async () => {
    const adapter = new ControlledAdapter();
    const sendGate = deferred();
    const entered = deferred();
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "press") {
        entered.resolve();
        await sendGate.promise;
      }
    };
    const controller = await makeController(adapter);
    const aborter = new AbortController();
    const reason = new Error("navigation");
    const press = controller.press("A", {
      durationMs: 500,
      signal: aborter.signal,
    });
    await entered.promise;
    aborter.abort(reason);
    sendGate.resolve();

    const error = await press.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({ abortReason: reason, cause: reason });
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    expect(controller.getState().buttons.A).toBe(false);
    await controller.disconnect();
  });

  test("retains a pending press send failure when cancellation races it", async () => {
    const adapter = new ControlledAdapter();
    const sendGate = deferred();
    const entered = deferred();
    const sendFailure = new Error("adapter send failed");
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "press") {
        entered.resolve();
        await sendGate.promise;
      }
    };
    const controller = await makeController(adapter);
    const aborter = new AbortController();
    const reason = "user took control";
    const press = controller.press("A", {
      durationMs: 500,
      signal: aborter.signal,
    });
    await entered.promise;
    aborter.abort(reason);
    sendGate.reject(sendFailure);

    const error = await press.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({
      abortReason: reason,
      cause: sendFailure,
      pressSendError: sendFailure,
    });
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
    ]);
    await controller.disconnect();
  });

  test("releases after an accepted press when cancellation arrives during the hold", async () => {
    const adapter = new ControlledAdapter();
    const controller = await makeController(adapter);
    const syncGate = deferred();
    const syncEntered = deferred();
    adapter.syncStateBehavior = async () => {
      syncEntered.resolve();
      await syncGate.promise;
    };
    const aborter = new AbortController();
    const press = controller.press("A", {
      durationMs: 500,
      signal: aborter.signal,
    });
    await syncEntered.promise;
    aborter.abort("target changed");
    syncGate.resolve();

    const error = await press.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    await controller.disconnect();
  });

  test("releases after accepted send when cancelled state sync rejects", async () => {
    const adapter = new ControlledAdapter();
    const controller = await makeController(adapter, true);
    const syncGate = deferred();
    const syncEntered = deferred();
    let pressSyncCount = 0;
    adapter.syncStateBehavior = async () => {
      pressSyncCount += 1;
      if (pressSyncCount === 1) {
        syncEntered.resolve();
        await syncGate.promise;
      }
    };
    const aborter = new AbortController();
    const reason = "target changed";
    const syncFailure = new Error("press state sync failed");
    const releaseFailure = new Error("release failed");
    const neutralizationFailure = new Error("neutralization failed");
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "release") {
        throw releaseFailure;
      }
    };
    adapter.neutralBehavior = async () => {
      throw neutralizationFailure;
    };
    const press = controller.press("A", {
      durationMs: 500,
      signal: aborter.signal,
    });
    await syncEntered.promise;
    aborter.abort(reason);
    syncGate.reject(syncFailure);

    const error = await press.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({
      abortReason: reason,
      cause: reason,
      postPressError: syncFailure,
      releaseError: releaseFailure,
      neutralizationError: neutralizationFailure,
    });
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    expect(adapter.neutralCalls).toBe(1);
    await controller.disconnect();
  });

  test("gives the timer path ownership once its release has started", async () => {
    const adapter = new ControlledAdapter();
    const releaseGate = deferred();
    const releaseEntered = deferred();
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "release") {
        releaseEntered.resolve();
        await releaseGate.promise;
      }
    };
    const controller = await makeController(adapter);
    const aborter = new AbortController();
    const press = controller.press("A", {
      durationMs: 1,
      signal: aborter.signal,
    });
    await releaseEntered.promise;
    aborter.abort("arrived after timed release started");
    releaseGate.resolve();

    await expect(press).resolves.toBeUndefined();
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    await controller.disconnect();
  });

  test("keeps normal positive-duration press and release behavior", async () => {
    const adapter = new ControlledAdapter();
    const controller = await makeController(adapter);

    await controller.press("A", { durationMs: 1 });

    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    expect(controller.getState().buttons.A).toBe(false);
    await controller.disconnect();
  });

  test("aggregates cancellation release and neutralization failures", async () => {
    const adapter = new ControlledAdapter();
    const releaseFailure = new Error("release failed");
    const neutralizationFailure = new Error("neutralization failed");
    adapter.sendBehavior = async (command) => {
      if (command.command.type === "release") {
        throw releaseFailure;
      }
    };
    adapter.neutralBehavior = async () => {
      throw neutralizationFailure;
    };
    const controller = await makeController(adapter, true);
    const aborter = new AbortController();
    const reason = new Error("task cancelled");
    const press = controller.press("A", {
      durationMs: 500,
      signal: aborter.signal,
    });
    while (adapter.history.length === 0) {
      await Promise.resolve();
    }
    aborter.abort(reason);

    const error = await press.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimedPressAbortError);
    expect(error).toMatchObject({
      abortReason: reason,
      cause: reason,
      releaseError: releaseFailure,
      neutralizationError: neutralizationFailure,
    });
    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "release",
    ]);
    expect(adapter.neutralCalls).toBe(1);
    await controller.disconnect();
  });

  test("leaves zero-duration abort behavior and persistent setButton semantics unchanged", async () => {
    const adapter = new ControlledAdapter();
    const controller = await makeController(adapter);
    const aborter = new AbortController();
    aborter.abort("ignored for zero-duration press");

    await controller.press("A", { durationMs: 0, signal: aborter.signal });
    await controller.setButton("B", true);

    expect(adapter.history.map(({ command }) => command.type)).toEqual([
      "press",
      "setButton",
    ]);
    expect(controller.getState().buttons.A).toBe(true);
    expect(controller.getState().buttons.B).toBe(true);
    await controller.disconnect();
  });

  test("preserves unrelated command error precedence under neutralOnError", async () => {
    const adapter = new ControlledAdapter();
    const commandFailure = new Error("command failed");
    const neutralizationFailure = new Error("neutral failed");
    adapter.sendBehavior = async () => {
      throw commandFailure;
    };
    adapter.neutralBehavior = async () => {
      throw neutralizationFailure;
    };
    const controller = await makeController(adapter, true);

    await expect(controller.setButton("A", true)).rejects.toBe(
      neutralizationFailure,
    );
    expect(adapter.neutralCalls).toBe(1);
    await controller.disconnect();
  });
});
