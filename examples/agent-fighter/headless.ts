import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import {
  type LocalPolicyRunMetadata,
  localPolicyRunMetadata,
  managementForRunnerSummary,
  parseHeadlessArgs,
  type RunnerOptions,
} from "./headless-options";

type PlayerId = "player-1" | "player-2";

type ArenaSnapshot = {
  mode?: string;
  timeRemaining?: number;
  winner?: PlayerId | null;
  round?: number;
  players?: Array<{
    id: PlayerId;
    hp?: number;
    x?: number;
    y?: number;
  }>;
};

type TelemetryPayload = {
  arena?: ArenaSnapshot;
  management?: Record<string, unknown>;
  events?: Array<{
    playerId?: PlayerId;
    source?: string;
    action?: string;
    timestamp?: number;
  }>;
};

type MatchSummary = {
  matchIndex: number;
  baseUrl: string;
  durationMs: number;
  pollMs: number;
  startedServer: boolean;
  roundsCompleted: number;
  winners: Record<PlayerId, number>;
  damage: {
    total: number;
    byPlayer: Record<PlayerId, number>;
  };
  decisions: {
    total: number;
    byPlayer: Record<PlayerId, number>;
    bySource: Record<string, number>;
  };
  finalArena?: ArenaSnapshot;
  management?: Record<string, unknown>;
};

type QualityCheck = {
  name: string;
  passed: boolean;
  actual: number;
  expected: number;
  message: string;
};

type QualitySummary = {
  passed: boolean;
  checks: QualityCheck[];
};

type SeriesSummary = {
  baseUrl: string;
  matchCount: number;
  matchDurationMs: number;
  pollMs: number;
  startedServer: boolean;
  localPolicy: LocalPolicyRunMetadata;
  totalDurationMs: number;
  aggregate: {
    roundsCompleted: number;
    winners: Record<PlayerId, number>;
    winRate: Record<PlayerId, number>;
    damage: MatchSummary["damage"];
    decisions: MatchSummary["decisions"];
    averageDecisionsPerMatch: number;
  };
  quality: QualitySummary;
  matches: MatchSummary[];
  finalArena?: ArenaSnapshot;
  management?: Record<string, unknown>;
};

const options = parseHeadlessArgs(Bun.argv.slice(2));
const baseUrl = options.url ?? `http://127.0.0.1:${options.port}`;
let serverProcess: Bun.Subprocess | undefined;
let browser: Browser | undefined;
let agentsStarted = false;

try {
  if (!options.url) {
    serverProcess = startServer(options);
    await waitForServer(baseUrl, options.startupTimeoutMs, serverProcess);
  }

  browser = await chromium.launch({ headless: !options.headed });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  pipeBrowserDiagnostics(page, options.verbose);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      typeof (window as Window & { advanceTime?: unknown }).advanceTime ===
      "function",
  );

  const summary = await runSeries(baseUrl, options);

  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json);
    console.log(`Headless match summary written to ${outputPath}`);
  } else {
    console.log(json);
  }

  if (!summary.quality.passed) {
    process.stderr.write("Headless match quality gates failed.\n");
    process.exitCode = 1;
  }
} finally {
  if (agentsStarted) {
    await postJson(`${baseUrl}/management/stop`).catch(() => undefined);
  }
  await browser?.close();
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    await Promise.race([serverProcess.exited, sleep(1000)]);
  }
}

async function runSeries(
  baseUrl: string,
  options: RunnerOptions,
): Promise<SeriesSummary> {
  const startedAt = Date.now();
  const matches: MatchSummary[] = [];

  for (let index = 0; index < options.matches; index += 1) {
    await postJson(`${baseUrl}/management/reset`);
    await postJson(`${baseUrl}/management/start`);
    agentsStarted = true;

    const match = await runMatch(baseUrl, options, index + 1);
    await postJson(`${baseUrl}/management/stop`);
    agentsStarted = false;

    const stoppedTelemetry = await getJson<TelemetryPayload>(
      `${baseUrl}/telemetry`,
    );
    const finalArena = stoppedTelemetry.arena ?? match.finalArena;
    const management = managementForRunnerSummary(
      stoppedTelemetry.management,
      options,
    );
    matches.push({
      ...match,
      damage: damageFromArena(finalArena),
      ...(finalArena ? { finalArena } : {}),
      ...(management ? { management } : {}),
    });

    if (index + 1 < options.matches && options.matchGapMs > 0) {
      await sleep(options.matchGapMs);
    }
  }

  const aggregate = aggregateMatches(matches);
  const quality = evaluateQuality(aggregate, options);
  const latest = matches.at(-1);
  const management = latest?.management;
  return {
    baseUrl,
    matchCount: options.matches,
    matchDurationMs: options.durationMs,
    pollMs: options.pollMs,
    startedServer: !options.url,
    localPolicy: localPolicyRunMetadata(options),
    totalDurationMs: Date.now() - startedAt,
    aggregate,
    quality,
    matches,
    ...(latest?.finalArena ? { finalArena: latest.finalArena } : {}),
    ...(management ? { management } : {}),
  };
}

async function runMatch(
  baseUrl: string,
  options: RunnerOptions,
  matchIndex: number,
): Promise<MatchSummary> {
  const startedAt = Date.now();
  const winners: Record<PlayerId, number> = {
    "player-1": 0,
    "player-2": 0,
  };
  let roundsCompleted = 0;
  let lastWinner: PlayerId | null = null;
  let latest: TelemetryPayload = {};

  while (Date.now() - startedAt < options.durationMs) {
    latest = await getJson<TelemetryPayload>(`${baseUrl}/telemetry`);
    const winner = normalizeWinner(latest.arena?.winner);
    if (winner && winner !== lastWinner) {
      winners[winner] += 1;
      roundsCompleted += 1;
      lastWinner = winner;
    }
    if (!winner && latest.arena?.mode === "playing") {
      lastWinner = null;
    }
    await sleep(options.pollMs);
  }

  latest = await getJson<TelemetryPayload>(`${baseUrl}/telemetry`);
  const events = (latest.events ?? []).filter(
    (event) =>
      typeof event.timestamp === "number" && event.timestamp >= startedAt,
  );
  const management = managementForRunnerSummary(latest.management, options);

  return {
    matchIndex,
    baseUrl,
    durationMs: Date.now() - startedAt,
    pollMs: options.pollMs,
    startedServer: !options.url,
    roundsCompleted,
    winners,
    damage: damageFromArena(latest.arena),
    decisions: {
      total: events.length,
      byPlayer: countByPlayer(events),
      bySource: countBySource(events),
    },
    ...(latest.arena ? { finalArena: latest.arena } : {}),
    ...(management ? { management } : {}),
  };
}

function aggregateMatches(matches: MatchSummary[]): SeriesSummary["aggregate"] {
  const winners: Record<PlayerId, number> = { "player-1": 0, "player-2": 0 };
  const damageByPlayer: Record<PlayerId, number> = {
    "player-1": 0,
    "player-2": 0,
  };
  const decisionsByPlayer: Record<PlayerId, number> = {
    "player-1": 0,
    "player-2": 0,
  };
  const decisionsBySource: Record<string, number> = {};
  let roundsCompleted = 0;
  let totalDecisions = 0;

  for (const match of matches) {
    roundsCompleted += match.roundsCompleted;
    winners["player-1"] += match.winners["player-1"];
    winners["player-2"] += match.winners["player-2"];
    damageByPlayer["player-1"] += match.damage.byPlayer["player-1"];
    damageByPlayer["player-2"] += match.damage.byPlayer["player-2"];
    decisionsByPlayer["player-1"] += match.decisions.byPlayer["player-1"];
    decisionsByPlayer["player-2"] += match.decisions.byPlayer["player-2"];
    totalDecisions += match.decisions.total;

    for (const [source, count] of Object.entries(match.decisions.bySource)) {
      decisionsBySource[source] = (decisionsBySource[source] ?? 0) + count;
    }
  }

  return {
    roundsCompleted,
    winners,
    winRate: {
      "player-1":
        roundsCompleted === 0 ? 0 : winners["player-1"] / roundsCompleted,
      "player-2":
        roundsCompleted === 0 ? 0 : winners["player-2"] / roundsCompleted,
    },
    damage: {
      total: damageByPlayer["player-1"] + damageByPlayer["player-2"],
      byPlayer: damageByPlayer,
    },
    decisions: {
      total: totalDecisions,
      byPlayer: decisionsByPlayer,
      bySource: decisionsBySource,
    },
    averageDecisionsPerMatch:
      matches.length === 0 ? 0 : totalDecisions / matches.length,
  };
}

function evaluateQuality(
  aggregate: SeriesSummary["aggregate"],
  options: RunnerOptions,
): QualitySummary {
  const checks: QualityCheck[] = [
    qualityCheck(
      "decisions.total",
      aggregate.decisions.total,
      options.minDecisions,
      `Expected at least ${options.minDecisions} controller decisions across the series.`,
    ),
    qualityCheck(
      "decisions.player-1",
      aggregate.decisions.byPlayer["player-1"],
      options.minDecisionsPerPlayer,
      `Expected player-1 to produce at least ${options.minDecisionsPerPlayer} decisions.`,
    ),
    qualityCheck(
      "decisions.player-2",
      aggregate.decisions.byPlayer["player-2"],
      options.minDecisionsPerPlayer,
      `Expected player-2 to produce at least ${options.minDecisionsPerPlayer} decisions.`,
    ),
    qualityCheck(
      "damage.total",
      aggregate.damage.total,
      options.minTotalDamage,
      `Expected at least ${options.minTotalDamage} total HP damage across the series.`,
    ),
    qualityCheck(
      "rounds.completed",
      aggregate.roundsCompleted,
      options.minRounds,
      `Expected at least ${options.minRounds} completed rounds across the series.`,
    ),
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

function qualityCheck(
  name: string,
  actual: number,
  expected: number,
  message: string,
): QualityCheck {
  return {
    name,
    actual,
    expected,
    passed: actual >= expected,
    message,
  };
}

function damageFromArena(
  arena: ArenaSnapshot | undefined,
): MatchSummary["damage"] {
  const byPlayer: Record<PlayerId, number> = {
    "player-1": 0,
    "player-2": 0,
  };

  for (const player of arena?.players ?? []) {
    byPlayer[player.id] = Math.max(0, 100 - Math.max(0, player.hp ?? 100));
  }

  return {
    total: byPlayer["player-1"] + byPlayer["player-2"],
    byPlayer,
  };
}

function startServer(options: RunnerOptions): Bun.Subprocess {
  const proc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...Bun.env,
      OPENCONTROLLER_FIGHTER_PORT: String(options.port),
      OPENCONTROLLER_AGENT_TICK_MS: String(
        Bun.env.OPENCONTROLLER_AGENT_TICK_MS ?? "16",
      ),
      OPENCONTROLLER_AGENT_FIGHTER_SEED:
        options.seed === undefined ? "" : String(options.seed),
    },
  });
  drainStream(proc.stdout, "server", options.verbose);
  drainStream(proc.stderr, "server", true);
  return proc;
}

function drainStream(
  stream: ReadableStream<Uint8Array> | null,
  label: string,
  verbose: boolean,
): void {
  if (!stream) {
    return;
  }
  const decoder = new TextDecoder();
  void (async () => {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        const text = decoder.decode(next.value, { stream: true });
        if (verbose && text.trim()) {
          process.stderr.write(`[${label}] ${text}`);
        }
      }
    } finally {
      reader.releaseLock();
    }
  })();
}

function pipeBrowserDiagnostics(page: Page, verbose: boolean): void {
  if (!verbose) {
    return;
  }
  page.on("console", (message) => {
    process.stderr.write(`[browser:${message.type()}] ${message.text()}\n`);
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[browser:error] ${error.message}\n`);
  });
}

async function waitForServer(
  baseUrl: string,
  startupTimeoutMs: number,
  serverProcess?: Bun.Subprocess,
): Promise<void> {
  const startedAt = Date.now();
  let serverExitCode: number | undefined;
  void serverProcess?.exited.then((exitCode) => {
    serverExitCode = exitCode;
  });

  while (Date.now() - startedAt < startupTimeoutMs) {
    if (serverExitCode !== undefined) {
      throw new Error(
        `Spawned OpenController Agent Fighter server exited before ${baseUrl} was ready (code ${serverExitCode})`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/state`, {
        headers: { accept: "application/json" },
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson(url: string): Promise<void> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
}

function countByPlayer(
  events: NonNullable<TelemetryPayload["events"]>,
): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = { "player-1": 0, "player-2": 0 };
  for (const event of events) {
    const playerId = normalizeWinner(event.playerId);
    if (playerId) {
      counts[playerId] += 1;
    }
  }
  return counts;
}

function countBySource(
  events: NonNullable<TelemetryPayload["events"]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const source = event.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}

function normalizeWinner(value: unknown): PlayerId | null {
  return value === "player-1" || value === "player-2" ? value : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
