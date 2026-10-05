import { describe, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("native uinput open retry helper", () => {
  const nativeTest = process.platform === "linux" ? test : test.skip;

  nativeTest("passes deterministic bounded retry cases", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "opencontroller-uinput-open-test-"),
    );
    const binaryPath = join(temporaryDirectory, "uinput-open-test");
    const testSourcePath = fileURLToPath(
      new URL("../helper/uinput-open-test.c", import.meta.url),
    );
    const helperDirectory = fileURLToPath(
      new URL("../helper/", import.meta.url),
    );

    try {
      execFileSync(
        "cc",
        [
          "-std=c11",
          "-D_DEFAULT_SOURCE",
          "-Wall",
          "-Wextra",
          "-Werror",
          "-Wno-unused-function",
          "-I",
          helperDirectory,
          testSourcePath,
          "-o",
          binaryPath,
        ],
        { stdio: "pipe" },
      );
      execFileSync(binaryPath, [], { stdio: "pipe" });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
