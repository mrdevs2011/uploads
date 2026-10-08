#!/usr/bin/env python3
"""Patch CMComputer + local cmc-backend to require reason on every run_command."""
from pathlib import Path

# ---------- 1. CMComputer src/index.ts ----------
path = Path("/home/muhamad/Claude/work/CMComputer/src/index.ts")
text = path.read_text()

old_desc = (
    '"Natija: stdout, stderr, exitCode, durationMs, riskLevel. " +\n'
    '        "Xavfli buyruq bloklanganda pendingId qaytariladi — dashboard orqali ham tasdiqlash mumkin.",'
)
new_desc = (
    '"HAR DOIM reason (nima uchun bu buyruq) majburiy — audit logga yoziladi. " +\n'
    '        "Natija: cwd, command, reason, stdout, stderr, exitCode, durationMs, riskLevel. " +\n'
    '        "Xavfli buyruq bloklanganda pendingId qaytariladi — dashboard orqali ham tasdiqlash mumkin.",'
)
if old_desc not in text:
    raise SystemExit("CMComputer index.ts: description marker not found")
text = text.replace(old_desc, new_desc)

old_schema = """          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Ish papkasi (ixtiyoriy). Berilmasa process.cwd() ishlatiladi. " +
              "Mavjud bo'lishi shart — avval mkdir qilish mumkin."
          ),
        confirmed: z"""

new_schema = """          ),
        reason: z
          .string()
          .min(1)
          .describe(
            "Nima uchun bu buyruq bajarilayapti (majburiy). Aniq va qisqa yoz. " +
              "Masalan: 'loyiha dependencylarini o\\'rnatish uchun npm install', " +
              "'git holatini tekshirish', 'build xatosini ko\\'rish uchun log o\\'qish'. " +
              "Chatga chiqmasa ham audit logga yoziladi."
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Ish papkasi (ixtiyoriy). Berilmasa process.cwd() ishlatiladi. " +
              "Mavjud bo'lishi shart — avval mkdir qilish mumkin."
          ),
        confirmed: z"""

if old_schema not in text:
    raise SystemExit("CMComputer index.ts: schema marker not found")
text = text.replace(old_schema, new_schema)

old_call = """const result = await runCommand({
        command: args.command,
        cwd: args.cwd,
        confirmed: args.confirmed,
      });"""
new_call = """const result = await runCommand({
        command: args.command,
        reason: args.reason,
        cwd: args.cwd,
        confirmed: args.confirmed,
      });"""
if old_call not in text:
    raise SystemExit("CMComputer index.ts: runCommand call not found")
text = text.replace(old_call, new_call)

old_out = """`cwd: ${result.cwd}`,
        `riskLevel: ${result.riskLevel ?? \"unknown\"}`,"""
new_out = """`cwd: ${result.cwd}`,
        `command: ${args.command}`,
        `reason: ${args.reason}`,
        `riskLevel: ${result.riskLevel ?? \"unknown\"}`,"""
if old_out not in text:
    raise SystemExit("CMComputer index.ts: response text not found")
text = text.replace(old_out, new_out)

old_ex = """`  command: \"${args.command}\",\\n` +
                `  cwd: ${args.cwd ? `\"${args.cwd}\"` : \"undefined\"},\\n` +
                `  confirmed: true\\n` +"""
new_ex = """`  command: \"${args.command}\",\\n` +
                `  reason: \"${args.reason}\",\\n` +
                `  cwd: ${args.cwd ? `\"${args.cwd}\"` : \"undefined\"},\\n` +
                `  confirmed: true\\n` +"""
if old_ex not in text:
    raise SystemExit("CMComputer index.ts: example not found")
text = text.replace(old_ex, new_ex)

path.write_text(text)
print("OK: CMComputer/src/index.ts")

# ---------- 2. Local cmc-backend tools.js ----------
path2 = Path("/home/muhamad/.config/cmc-backend/src/tools.js")
t2 = path2.read_text()

old_desc2 = '''      description:
        "Kompyuterda istalgan buyruqni bajaradi. Fixed WORKDIR yoki sandbox yo'q — " +
        "cwd berilmasa process.cwd() ishlatiladi. Xavfli buyruqlar (rm -rf, shutdown, " +
        "git push --force va h.k.) uchun confirmed:true talab qilinadi. 30 soniya timeout.",'''

new_desc2 = '''      description:
        "Kompyuterda istalgan buyruqni bajaradi. Fixed WORKDIR yoki sandbox yo'q — " +
        "cwd berilmasa process.cwd() ishlatiladi. Xavfli buyruqlar (rm -rf, shutdown, " +
        "git push --force va h.k.) uchun confirmed:true talab qilinadi. 30 soniya timeout. " +
        "HAR DOIM reason (nima uchun bu buyruq bajarilayapti) majburiy — audit logga yoziladi, " +
        "chatga chiqmasa ham. Natija: cwd, command, reason, stdout, stderr.",'''

if old_desc2 not in t2:
    raise SystemExit("tools.js: description not found")
t2 = t2.replace(old_desc2, new_desc2)

old_schema2 = '''        confirmed: z
          .boolean()
          .optional()
          .describe("Xavfli buyruqni tasdiqlash. dangerous/hard_write darajasi uchun true kerak."),
      },
    },
    async ({ command: rawCommand, cwd, confirmed }) => {'''

new_schema2 = '''        reason: z
          .string()
          .min(1)
          .describe(
            "Nima uchun bu buyruq bajarilayapti (majburiy). Aniq va qisqa yoz. " +
            "Masalan: 'loyiha dependencylarini o\\'rnatish uchun npm install'. " +
            "Chatga chiqmasa ham audit logga yoziladi."
          ),
        confirmed: z
          .boolean()
          .optional()
          .describe("Xavfli buyruqni tasdiqlash. dangerous/hard_write darajasi uchun true kerak."),
      },
    },
    async ({ command: rawCommand, cwd, confirmed, reason }) => {'''

if old_schema2 not in t2:
    raise SystemExit("tools.js: schema/handler not found")
t2 = t2.replace(old_schema2, new_schema2)

old_log = '''      logCommandHistory({
        at: new Date().toISOString(),
        command,
        cwd: resolvedCwd,
        riskLevel,
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs,
      });'''

new_log = '''      logCommandHistory({
        at: new Date().toISOString(),
        command,
        cwd: resolvedCwd,
        reason: reason || "",
        riskLevel,
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs,
      });'''

if old_log not in t2:
    raise SystemExit("tools.js: logCommandHistory not found")
t2 = t2.replace(old_log, new_log)

old_out2 = '''      const text = [
        `ok: ${result.ok}`,
        `exitCode: ${result.exitCode}`,
        `durationMs: ${durationMs}`,
        `cwd: ${resolvedCwd}`,
        `riskLevel: ${riskLevel}`,
        "----- stdout -----",
        result.stdout || "(bo'sh)",
        "----- stderr -----",
        result.stderr || "(bo'sh)",
      ].join("\\n");'''

new_out2 = '''      const text = [
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
      ].join("\\n");'''

if old_out2 not in t2:
    raise SystemExit("tools.js: response text not found")
t2 = t2.replace(old_out2, new_out2)

# get_recent_commands display
old_hist = '''          return [
            `#${i + 1} [${e.at}]`,
            `command: ${e.command}`,
            `cwd: ${e.cwd}`,
            `riskLevel: ${e.riskLevel}  ok: ${e.ok}  exitCode: ${e.exitCode}  durationMs: ${e.durationMs}`,
          ].join("\\n");'''

new_hist = '''          return [
            `#${i + 1} [${e.at}]`,
            `command: ${e.command}`,
            `cwd: ${e.cwd}`,
            `reason: ${e.reason || "(yoq)"}`,
            `riskLevel: ${e.riskLevel}  ok: ${e.ok}  exitCode: ${e.exitCode}  durationMs: ${e.durationMs}`,
          ].join("\\n");'''

if old_hist not in t2:
    raise SystemExit("tools.js: history display not found")
t2 = t2.replace(old_hist, new_hist)

path2.write_text(t2)
print("OK: cmc-backend/src/tools.js")

print("ALL DONE")
