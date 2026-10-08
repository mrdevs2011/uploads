#!/usr/bin/env python3
"""Log reason even when command is blocked for confirmation; restart backend cleanly."""
from pathlib import Path

p = Path("/home/muhamad/.config/cmc-backend/src/tools.js")
t = p.read_text()

old = """      if (requiresConfirmation(command) && !confirmed) {
        return {
          content: [
            {
              type: "text",
              text:
                `\\u26a0\\ufe0f XAVFLI BUYRUQ BLOKLANDI\\n\\n` +
                `Buyruq: ${command}\\nDaraja: ${riskLevel}\\n\\n` +
                `Davom etish uchun confirmed: true bilan qayta chaqiring.`,
            },
          ],
          isError: true,
        };
      }"""

# The file has the actual emoji, not escape sequences
old = """      if (requiresConfirmation(command) && !confirmed) {
        return {
          content: [
            {
              type: "text",
              text:
                `\u26a0\ufe0f XAVFLI BUYRUQ BLOKLANDI\\n\\n` +
                `Buyruq: ${command}\\nDaraja: ${riskLevel}\\n\\n` +
                `Davom etish uchun confirmed: true bilan qayta chaqiring.`,
            },
          ],
          isError: true,
        };
      }"""

new = """      if (requiresConfirmation(command) && !confirmed) {
        logCommandHistory({
          at: new Date().toISOString(),
          command,
          cwd: cwd ? resolve(cwd) : process.cwd(),
          reason: reason || "",
          riskLevel,
          ok: false,
          exitCode: null,
          durationMs: 0,
          blocked: true,
        });
        return {
          content: [
            {
              type: "text",
              text:
                `\u26a0\ufe0f XAVFLI BUYRUQ BLOKLANDI\\n\\n` +
                `Buyruq: ${command}\\n` +
                `reason: ${reason || ""}\\n` +
                `Daraja: ${riskLevel}\\n\\n` +
                `Davom etish uchun confirmed: true bilan qayta chaqiring.`,
            },
          ],
          isError: true,
        };
      }"""

if old not in t:
    # debug
    idx = t.find("if (requiresConfirmation(command) && !confirmed)")
    raise SystemExit("block not found, context: " + repr(t[idx:idx+400]))

t = t.replace(old, new)
p.write_text(t)
print("OK: blocked path now logs reason")
