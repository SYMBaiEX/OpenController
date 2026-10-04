import { describe, expect, test } from "bun:test";
import {
  localPolicyRunMetadata,
  managementForRunnerSummary,
  parseHeadlessArgs,
} from "../headless-options";
import {
  createLocalPolicyRandom,
  decideLocally,
  localPolicySeedLimit,
  parseLocalPolicySeed,
} from "../local-policy";

const closeRangeObservation = {
  mode: "playing",
  me: { hp: 100, x: 200 },
  enemy: { x: 250, attacking: false },
};

describe("seeded Agent Fighter local policy", () => {
  test("repeats decisions for a seed and the same observation sequence", () => {
    const firstRandom = createLocalPolicyRandom(1234, "player-1");
    const secondRandom = createLocalPolicyRandom(1234, "player-1");

    const first = Array.from({ length: 20 }, () =>
      decideLocally("player-1", closeRangeObservation, firstRandom),
    );
    const second = Array.from({ length: 20 }, () =>
      decideLocally("player-1", closeRangeObservation, secondRandom),
    );

    expect(first).toEqual(second);
  });

  test("different seeds can change a randomized close-range choice", () => {
    const first = decideLocally(
      "player-1",
      closeRangeObservation,
      createLocalPolicyRandom(0, "player-1"),
    );
    const second = decideLocally(
      "player-1",
      closeRangeObservation,
      createLocalPolicyRandom(2, "player-1"),
    );

    expect(first).toBe("heavy");
    expect(second).toBe("light");
  });

  test("seeded choices do not use or replace global Math.random", () => {
    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error("seeded policy unexpectedly used global Math.random");
    };
    try {
      expect(
        decideLocally(
          "player-1",
          closeRangeObservation,
          createLocalPolicyRandom(0, "player-1"),
        ),
      ).toBe("heavy");
    } finally {
      Math.random = originalRandom;
    }
  });

  test("validates local policy seeds and the runner's control boundary", () => {
    expect(parseLocalPolicySeed(undefined)).toBeUndefined();
    expect(parseLocalPolicySeed("0")).toBe(0);
    expect(parseLocalPolicySeed(String(localPolicySeedLimit))).toBe(
      localPolicySeedLimit,
    );
    expect(() => parseLocalPolicySeed("-1")).toThrow("integer between 0");
    expect(() => parseLocalPolicySeed("1.5")).toThrow("integer between 0");
    expect(() => parseLocalPolicySeed("4294967296")).toThrow(
      "integer between 0",
    );

    const seededOptions = parseHeadlessArgs(["--seed", "42"]);
    expect(seededOptions.seed).toBe(42);
    expect(localPolicyRunMetadata(seededOptions)).toMatchObject({
      server: "runner-spawned",
      randomSource: "mulberry32-v1",
      seed: 42,
    });
    const externalOptions = parseHeadlessArgs([
      "--url",
      "http://localhost:5173",
    ]);
    expect(localPolicyRunMetadata(externalOptions)).toMatchObject({
      server: "external",
      randomSource: "unknown-external-server",
    });
    expect(localPolicyRunMetadata(externalOptions)).not.toHaveProperty("seed");
    expect(
      managementForRunnerSummary(
        {
          localPolicy: { seed: 99, randomSource: "mulberry32-v1" },
        },
        externalOptions,
      )?.localPolicy,
    ).toEqual({
      server: "external",
      randomSource: "unknown-external-server",
      seedScope:
        "The headless runner did not configure this external server's seed.",
    });
    expect(() =>
      parseHeadlessArgs(["--url", "http://localhost:5173", "--seed", "42"]),
    ).toThrow("--seed requires a runner-spawned server");
  });
});
