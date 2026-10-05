import { describe, expect, test } from "bun:test";
import { type ControllerAdapter, createAdapterCapabilities } from "../adapters";
import { ControllerHubDisconnectAllError, createControllerHub } from "../index";
import type { NormalizedControllerCommand } from "../types";

class DisconnectAdapter implements ControllerAdapter {
  readonly name = "disconnect-test";
  readonly platform = "all" as const;
  attempts = 0;

  constructor(
    private readonly onDisconnect: () => Promise<void> = async () => {},
    private readonly onConnect: () => Promise<void> = async () => {},
  ) {}

  async connect(): Promise<void> {
    await this.onConnect();
  }

  async send(_command: NormalizedControllerCommand): Promise<void> {}

  async neutral(_command?: NormalizedControllerCommand): Promise<void> {}

  async disconnect(): Promise<void> {
    this.attempts += 1;
    await this.onDisconnect();
  }

  capabilities() {
    return createAdapterCapabilities();
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ControllerHub.disconnectAll", () => {
  test("settles every snapshot attempt, removes successes, and reports original failures", async () => {
    const slowFailure = deferred();
    const fastFailure = deferred();
    const failuresStarted = deferred();
    const firstFailureSettled = deferred();
    let startedFailures = 0;
    const success = new DisconnectAdapter();
    const onFailureDisconnect = (promise: Promise<void>) => async () => {
      startedFailures += 1;
      if (startedFailures === 2) failuresStarted.resolve();
      await promise;
    };
    const firstFailure = new DisconnectAdapter(async () => {
      try {
        await onFailureDisconnect(fastFailure.promise)();
      } finally {
        firstFailureSettled.resolve();
      }
    });
    const secondFailure = new DisconnectAdapter(
      onFailureDisconnect(slowFailure.promise),
    );
    const hub = await createControllerHub();

    await hub.add({
      id: "success",
      profile: "xbox",
      adapter: success,
      replay: false,
    });
    await hub.add({
      id: "failure-1",
      profile: "xbox",
      adapter: firstFailure,
      replay: false,
    });
    await hub.add({
      id: "failure-2",
      profile: "xbox",
      adapter: secondFailure,
      replay: false,
    });

    const disconnecting = hub.disconnectAll();
    await failuresStarted.promise;
    expect(success.attempts).toBe(1);
    expect(firstFailure.attempts).toBe(1);
    expect(secondFailure.attempts).toBe(1);

    const addedAfterSnapshot = new DisconnectAdapter();
    await hub.add({
      id: "after-snapshot",
      profile: "xbox",
      adapter: addedAfterSnapshot,
      replay: false,
    });

    const errorOne = new Error("first failed");
    const errorTwo = new Error("second failed");
    fastFailure.reject(errorOne);
    await firstFailureSettled.promise;
    let settled = false;
    void disconnecting.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    slowFailure.reject(errorTwo);
    let disconnectError: unknown;
    try {
      await disconnecting;
    } catch (error) {
      disconnectError = error;
    }

    expect(disconnectError).toBeInstanceOf(ControllerHubDisconnectAllError);
    const failures = (disconnectError as ControllerHubDisconnectAllError)
      .failuresById;
    expect(failures).toEqual({ "failure-1": errorOne, "failure-2": errorTwo });
    expect(failures["failure-1"]).toBe(errorOne);
    expect(failures["failure-2"]).toBe(errorTwo);
    expect(hub.list()).toEqual(["failure-1", "failure-2", "after-snapshot"]);
    expect(hub.get("after-snapshot")).toBeDefined();
    expect(addedAfterSnapshot.attempts).toBe(0);
  });

  test("empties the hub when every snapshotted disconnect succeeds", async () => {
    const left = new DisconnectAdapter();
    const right = new DisconnectAdapter();
    const hub = await createControllerHub();
    await hub.add({
      id: "left",
      profile: "xbox",
      adapter: left,
      replay: false,
    });
    await hub.add({
      id: "right",
      profile: "xbox",
      adapter: right,
      replay: false,
    });

    await hub.disconnectAll();

    expect(hub.list()).toEqual([]);
    expect(left.attempts).toBe(1);
    expect(right.attempts).toBe(1);
  });

  test("does not wait for an in-flight add that callers must await first", async () => {
    const connecting = deferred();
    const connectStarted = deferred();
    const adapter = new DisconnectAdapter(
      async () => {},
      async () => {
        connectStarted.resolve();
        await connecting.promise;
      },
    );
    const hub = await createControllerHub();

    const adding = hub.add({
      id: "pending-add",
      profile: "xbox",
      adapter,
      replay: false,
    });
    await connectStarted.promise;

    await hub.disconnectAll();
    expect(adapter.attempts).toBe(0);

    connecting.resolve();
    await adding;
    expect(hub.has("pending-add")).toBe(true);
    await hub.disconnectAll();
  });

  test("retains an ID for retry when its adapter remains usable", async () => {
    let attempts = 0;
    const retryingAdapter = new DisconnectAdapter(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary disconnect failure");
      }
    });
    const hub = await createControllerHub();
    await hub.add({
      id: "retryable",
      profile: "xbox",
      adapter: retryingAdapter,
      replay: false,
    });

    await expect(hub.disconnectAll()).rejects.toBeInstanceOf(
      ControllerHubDisconnectAllError,
    );
    expect(hub.has("retryable")).toBe(true);

    await hub.disconnectAll();

    expect(hub.has("retryable")).toBe(false);
    expect(retryingAdapter.attempts).toBe(2);
  });
});
