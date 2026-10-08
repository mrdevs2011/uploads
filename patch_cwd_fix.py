#!/usr/bin/env python3
"""Fix CMC cwd: default to HOME/last-cwd (not backend), report final pwd after command."""
from pathlib import Path

# ========== 1. Live backend tools.js ==========
p = Path("/home/muhamad/.config/cmc-backend/src/tools.js")
t = p.read_text()

# --- Add LAST_CWD helpers after STATE_DIR constants ---
old_const = """const STATE_DIR = join(__dirname, "..", ".state");
const HISTORY_PATH = join(STATE_DIR, "commands.jsonl");
const HISTORY_MAX_LINES = 2000; // shu sondan oshsa oxirgi 1000 tasi qoldiriladi
const HISTORY_TRIM_TO = 1000;"""

new_const = """const STATE_DIR = join(__dirname, "..", ".state");
const HISTORY_PATH = join(STATE_DIR, "commands.jsonl");
const LAST_CWD_PATH = join(STATE_DIR, "last-cwd");
const HISTORY_MAX_LINES = 2000; // shu sondan oshsa oxirgi 1000 tasi qoldiriladi
const HISTORY_TRIM_TO = 1000;
const CWD_MARKER = "__CMC_FINAL_CWD__:";

/** Backend process.cwd() EMAS — oxirgi ish papkasi yoki $HOME */
function getDefaultCwd() {
  try {
    if (existsSync(LAST_CWD_PATH)) {
      const last = readFileSync(LAST_CWD_PATH, "utf8").trim();
      if (last && existsSync(last)) return last;
    }
  } catch {
    // ignore
  }
  return process.env.HOME || "/home/muhamad";
}

function saveLastCwd(dir) {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    if (dir && existsSync(dir)) writeFileSync(LAST_CWD_PATH, dir + "\\n", "utf8");
  } catch {
    // ignore
  }
}

/** Shell buyruqdan keyin haqiqiy pwd ni ajratib oladi */
function extractFinalCwd(stdout, fallback) {
  if (!stdout) return { cleanStdout: stdout || "", finalCwd: fallback };
  const lines = stdout.split("\\n");
  let finalCwd = fallback;
  const kept = [];
  for (const line of lines) {
    if (line.startsWith(CWD_MARKER)) {
      const got = line.slice(CWD_MARKER.length).trim();
      if (got) finalCwd = got;
    } else {
      kept.push(line);
    }
  }
  // oxiridagi bo'sh qatorni saqlash uchun join
  let cleanStdout = kept.join("\\n");
  // marker olib tashlanganda ortiqcha trailing newline bo'lsa ok
  return { cleanStdout, finalCwd };
}"""

if old_const not in t:
    raise SystemExit("tools.js: const block not found")
t = t.replace(old_const, new_const)

# --- Update cwd description ---
old_cwd_desc = '''        cwd: z
          .string()
          .optional()
          .describe("Ish papkasi (ixtiyoriy). Berilmasa process.cwd() ishlatiladi, mavjud bo'lishi shart."),'''

new_cwd_desc = '''        cwd: z
          .string()
          .optional()
          .describe(
            "Ish papkasi (ixtiyoriy). Berilmasa oxirgi ishlatilgan papka yoki $HOME. " +
            "Backend papkasi EMAS. Javobda buyruqdan keyingi haqiqiy pwd chiqadi."
          ),'''

if old_cwd_desc not in t:
    raise SystemExit("tools.js: cwd describe not found")
t = t.replace(old_cwd_desc, new_cwd_desc)

# --- resolve cwd: use getDefaultCwd ---
old_resolve = """      let resolvedCwd;
      try {
        resolvedCwd = cwd ? resolve(cwd) : process.cwd();
        await access(resolvedCwd, constants.F_OK);
      } catch {
        return {
          content: [{ type: "text", text: `Xato: cwd mavjud emas: ${cwd}` }],
          isError: true,
        };
      }"""

new_resolve = """      let resolvedCwd;
      try {
        resolvedCwd = cwd ? resolve(cwd) : getDefaultCwd();
        await access(resolvedCwd, constants.F_OK);
      } catch {
        return {
          content: [{ type: "text", text: `Xato: cwd mavjud emas: ${cwd || resolvedCwd}` }],
          isError: true,
        };
      }"""

if old_resolve not in t:
    raise SystemExit("tools.js: resolve block not found")
t = t.replace(old_resolve, new_resolve)

# --- Wrap shell command to capture final pwd; parse after ---
old_spawn = """      const start = Date.now();
      const result = await new Promise((res) => {
        let stdout = "";
        let stderr = "";
        let killedByTimeout = false;

        const argv = safeParseArgv(command);
        const child = argv
          ? spawn(argv[0], argv.slice(1), {
              cwd: resolvedCwd,
              shell: false,
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            })
          : spawn(command, {
              cwd: resolvedCwd,
              shell: true,
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            });"""

new_spawn = """      const start = Date.now();
      const result = await new Promise((res) => {
        let stdout = "";
        let stderr = "";
        let killedByTimeout = false;

        const argv = safeParseArgv(command);
        // Shell yo'lida oxirida pwd ni yozib qo'yamiz — cd qilingan joy ham ko'rinsin
        const shellCmd = argv
          ? null
          : [
              "set +e",
              command,
              "__cmc_ec=$?",
              `printf '\\\\n${CWD_MARKER}%s\\\\n' "$(pwd)"`,
              "exit $__cmc_ec",
            ].join("\\n");

        const child = argv
          ? spawn(argv[0], argv.slice(1), {
              cwd: resolvedCwd,
              shell: false,
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            })
          : spawn(shellCmd, {
              cwd: resolvedCwd,
              shell: true,
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            });"""

if old_spawn not in t:
    raise SystemExit("tools.js: spawn block not found")
t = t.replace(old_spawn, new_spawn)

# --- After result, extract final cwd, save, report ---
old_after = """      const durationMs = Date.now() - start;

      logCommandHistory({
        at: new Date().toISOString(),
        command,
        cwd: resolvedCwd,
        reason: reason || "",
        riskLevel,
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs,
      });

      const text = [
        `ok: ${result.ok}`,
        `exitCode: ${result.exitCode}`,
        `durationMs: ${durationMs}`,
        `cwd: ${resolvedCwd}`,
        `command: ${command}`,
        `reason: ${reason || ""}`,
        `riskLevel: ${riskLevel}`,
        "----- stdout -----",
        result.stdout || "(bo'sh)",
        "----- stderr -----",
        result.stderr || "(bo'sh)",
      ].join("\\n");

      return { content: [{ type: "text", text }], isError: !result.ok };"""

new_after = """      const durationMs = Date.now() - start;

      // Shell buyruqdan keyingi haqiqiy pwd (cd ishlagan bo'lsa yangi joy)
      const { cleanStdout, finalCwd } = extractFinalCwd(result.stdout, resolvedCwd);
      result.stdout = cleanStdout;
      saveLastCwd(finalCwd);

      logCommandHistory({
        at: new Date().toISOString(),
        command,
        cwd: finalCwd,
        reason: reason || "",
        riskLevel,
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs,
      });

      const text = [
        `ok: ${result.ok}`,
        `exitCode: ${result.exitCode}`,
        `durationMs: ${durationMs}`,
        `cwd: ${finalCwd}`,
        `command: ${command}`,
        `reason: ${reason || ""}`,
        `riskLevel: ${riskLevel}`,
        "----- stdout -----",
        result.stdout || "(bo'sh)",
        "----- stderr -----",
        result.stderr || "(bo'sh)",
      ].join("\\n");

      return { content: [{ type: "text", text }], isError: !result.ok };"""

if old_after not in t:
    raise SystemExit("tools.js: after-result block not found")
t = t.replace(old_after, new_after)

p.write_text(t)
print("OK: tools.js cwd fix")

# ========== 2. CMComputer run_command.ts ==========
p2 = Path("/home/muhamad/Claude/work/CMComputer/src/run_command.ts")
t2 = p2.read_text()

# Update resolveCwd and add last-cwd support
old_rc = """import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import { requiresConfirmation, getRiskLevel } from "./danger.js";
import { logCommand } from "./audit.js";
import { addPending } from "./pending.js";

const TIMEOUT_MS = 30_000;"""

new_rc = """import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requiresConfirmation, getRiskLevel } from "./danger.js";
import { logCommand } from "./audit.js";
import { addPending } from "./pending.js";

const TIMEOUT_MS = 30_000;
const CWD_MARKER = "__CMC_FINAL_CWD__:";
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", ".state");
const LAST_CWD_PATH = join(STATE_DIR, "last-cwd");

function getDefaultCwd(): string {
  try {
    if (existsSync(LAST_CWD_PATH)) {
      const last = readFileSync(LAST_CWD_PATH, "utf8").trim();
      if (last && existsSync(last)) return last;
    }
  } catch {
    // ignore
  }
  return process.env.HOME || "/home/muhamad";
}

function saveLastCwd(dir: string): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    if (dir && existsSync(dir)) writeFileSync(LAST_CWD_PATH, dir + "\\n", "utf8");
  } catch {
    // ignore
  }
}

function extractFinalCwd(stdout: string, fallback: string): { cleanStdout: string; finalCwd: string } {
  if (!stdout) return { cleanStdout: stdout || "", finalCwd: fallback };
  const lines = stdout.split("\\n");
  let finalCwd = fallback;
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith(CWD_MARKER)) {
      const got = line.slice(CWD_MARKER.length).trim();
      if (got) finalCwd = got;
    } else {
      kept.push(line);
    }
  }
  return { cleanStdout: kept.join("\\n"), finalCwd };
}"""

if old_rc not in t2:
    raise SystemExit("run_command.ts: imports not found")
t2 = t2.replace(old_rc, new_rc)

old_resolve2 = """async function resolveCwd(requestedCwd?: string): Promise<string> {
  const base = requestedCwd ? resolve(requestedCwd) : process.cwd();
  try {
    await access(base, constants.F_OK);
  } catch {
    throw new Error(`cwd mavjud emas: ${base}`);
  }
  return base;
}"""

new_resolve2 = """async function resolveCwd(requestedCwd?: string): Promise<string> {
  const base = requestedCwd ? resolve(requestedCwd) : getDefaultCwd();
  try {
    await access(base, constants.F_OK);
  } catch {
    throw new Error(`cwd mavjud emas: ${base}`);
  }
  return base;
}"""

if old_resolve2 not in t2:
    raise SystemExit("run_command.ts: resolveCwd not found")
t2 = t2.replace(old_resolve2, new_resolve2)

# Wrap spawn and update close handler to extract cwd
# Find the spawn(command) call
old_spawn2 = """    const child = spawn(input.command, {
      cwd,
      shell: true,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });"""

new_spawn2 = """    const shellCmd = [
      "set +e",
      input.command,
      "__cmc_ec=$?",
      `printf '\\\\n${CWD_MARKER}%s\\\\n' "$(pwd)"`,
      "exit $__cmc_ec",
    ].join("\\n");

    const child = spawn(shellCmd, {
      cwd,
      shell: true,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });"""

if old_spawn2 not in t2:
    raise SystemExit("run_command.ts: spawn not found")
t2 = t2.replace(old_spawn2, new_spawn2)

# On success close - extract cwd before logCommand
# There are multiple logCommand in close - the success one
old_close_ok = """      await logCommand({
        command: input.command,
        cwd,
        result: code === 0 ? "success" : "error",
        durationMs,
        riskLevel,
        confirmed: !!input.confirmed,
        exitCode: code,
        reason: input.reason,
      });

      resolvePromise({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code,
        durationMs,
        cwd,
        riskLevel,
      });"""

new_close_ok = """      const extracted = extractFinalCwd(stdout, cwd);
      stdout = extracted.cleanStdout;
      const finalCwd = extracted.finalCwd;
      saveLastCwd(finalCwd);

      await logCommand({
        command: input.command,
        cwd: finalCwd,
        result: code === 0 ? "success" : "error",
        durationMs,
        riskLevel,
        confirmed: !!input.confirmed,
        exitCode: code,
        reason: input.reason,
      });

      resolvePromise({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code,
        durationMs,
        cwd: finalCwd,
        riskLevel,
      });"""

if old_close_ok not in t2:
    raise SystemExit("run_command.ts: close success block not found")
t2 = t2.replace(old_close_ok, new_close_ok)

p2.write_text(t2)
print("OK: run_command.ts cwd fix")

# ========== 3. CMComputer index.ts cwd describe ==========
p3 = Path("/home/muhamad/Claude/work/CMComputer/src/index.ts")
t3 = p3.read_text()
old_d = '''        cwd: z
          .string()
          .optional()
          .describe(
            "Ish papkasi (ixtiyoriy). Berilmasa process.cwd() ishlatiladi. " +
              "Mavjud bo'lishi shart — avval mkdir qilish mumkin."
          ),'''
new_d = '''        cwd: z
          .string()
          .optional()
          .describe(
            "Ish papkasi (ixtiyoriy). Berilmasa oxirgi ishlatilgan papka yoki $HOME " +
              "(backend papkasi EMAS). Javobda buyruqdan keyingi haqiqiy pwd chiqadi."
          ),'''
if old_d in t3:
    t3 = t3.replace(old_d, new_d)
    p3.write_text(t3)
    print("OK: index.ts cwd describe")
else:
    print("SKIP: index.ts cwd describe (already changed or different)")

# ========== 4. Init last-cwd to HOME ==========
home = Path.home()
state = Path("/home/muhamad/.config/cmc-backend/.state")
state.mkdir(parents=True, exist_ok=True)
(state / "last-cwd").write_text(str(home) + "\n")
print(f"OK: last-cwd initialized to {home}")

print("ALL CWD FIX DONE")
