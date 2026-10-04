export type PlayerId = "player-1" | "player-2";

export type FighterAction =
  | "advance"
  | "retreat"
  | "jump"
  | "light"
  | "heavy"
  | "block"
  | "dash"
  | "special"
  | "neutral";

export type LocalPolicyObservation = {
  mode: string;
  me?: { hp: number; x: number } | undefined;
  enemy?: { x: number; attacking: boolean } | undefined;
};

export type PolicyRandom = () => number;

export const localPolicyRngVersion = "mulberry32-v1" as const;
export const localPolicySeedLimit = 0xffff_ffff;

/** Create a local-policy random stream without modifying global Math.random. */
export function createLocalPolicyRandom(
  seed: number | undefined,
  streamId: string,
): PolicyRandom {
  if (seed === undefined) {
    return Math.random;
  }

  let state = (seed ^ hashString(streamId)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function parseLocalPolicySeed(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > localPolicySeedLimit) {
    throw new Error(
      `Local policy seed must be an integer between 0 and ${localPolicySeedLimit}`,
    );
  }
  return seed;
}

export function decideLocally(
  playerId: PlayerId,
  observation: LocalPolicyObservation,
  random: PolicyRandom,
): FighterAction {
  const me = observation.me;
  const enemy = observation.enemy;
  if (!me || !enemy || observation.mode !== "playing") {
    return "neutral";
  }
  const distance = Math.abs(enemy.x - me.x);
  if (me.hp < 28 && distance < 110 && enemy.attacking) {
    return "block";
  }
  if (distance > 430) {
    return "special";
  }
  if (distance > 150) {
    return playerId === "player-1" ? "advance" : "dash";
  }
  if (enemy.attacking && distance < 120) {
    return "retreat";
  }
  if (distance < 76) {
    return random() > 0.62 ? "heavy" : "light";
  }
  return random() > 0.72 ? "jump" : "advance";
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
