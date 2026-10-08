#!/usr/bin/env python3
"""Update instruction.md and cmc-ishlatish.md to require reason on run_command."""
from pathlib import Path

# ---------- cmc-ishlatish.md ----------
p = Path("/home/muhamad/Claude/.skills/my-computer/cmc-ishlatish.md")
t = p.read_text()

old_params = (
    "`run_command` parametrlari:\n"
    "- `command` (majburiy): bajariladigan buyruq.\n"
    "- `cwd` (ixtiyoriy): ish papkasi. Berilmasa cmc'ning o'z papkasi ishlatiladi\n"
    "  (`/home/muhamad/.config/cmc-backend`), shuning uchun nisbiy yo'l ishlatma:\n"
    "  yo'lni to'liq yoz yoki `cd ... &&` qil.\n"
    "- `confirmed` (ixtiyoriy): xavfli buyruq uchun `true`."
)

new_params = (
    "`run_command` parametrlari:\n"
    "- `command` (majburiy): bajariladigan buyruq.\n"
    "- `reason` (majburiy): nima uchun bu buyruq bajarilayapti. Aniq va qisqa.\n"
    "  Masalan: `loyiha dependencylarini o'rnatish uchun npm install`.\n"
    "  Chatga chiqmasa ham audit logga yoziladi — har doim to'ldir.\n"
    "- `cwd` (ixtiyoriy): ish papkasi. Berilmasa cmc'ning o'z papkasi ishlatiladi\n"
    "  (`/home/muhamad/.config/cmc-backend`), shuning uchun nisbiy yo'l ishlatma:\n"
    "  yo'lni to'liq yoz yoki `cd ... &&` qil.\n"
    "- `confirmed` (ixtiyoriy): xavfli buyruq uchun `true`."
)

if old_params not in t:
    raise SystemExit("cmc-ishlatish: params block not found")
t = t.replace(old_params, new_params)

old_resp = (
    "Javob shakli:\n"
    "```\n"
    "ok: true|false\n"
    "exitCode: 0\n"
    "durationMs: 12\n"
    "cwd: /home/muhamad/...\n"
    "riskLevel: read_safe | unknown | dangerous | hard_write ...\n"
    "----- stdout -----\n"
    "...\n"
    "----- stderr -----\n"
    "...\n"
    "```"
)

new_resp = (
    "Javob shakli:\n"
    "```\n"
    "ok: true|false\n"
    "exitCode: 0\n"
    "durationMs: 12\n"
    "cwd: /home/muhamad/...\n"
    "command: npm install\n"
    "reason: bu path ga npm paketlarini yuklayabmiz, loyiha shu joyiga kerak\n"
    "riskLevel: read_safe | unknown | dangerous | hard_write ...\n"
    "----- stdout -----\n"
    "...\n"
    "----- stderr -----\n"
    "...\n"
    "```"
)

if old_resp not in t:
    # try without exact match - find and report
    idx = t.find("Javob shakli:")
    print("RESP CONTEXT:", repr(t[idx:idx+350]))
    raise SystemExit("cmc-ishlatish: response block not found")
t = t.replace(old_resp, new_resp)

# Add mandatory reason section after scope section if not present
if "REASON MAJBURIY" not in t:
    insert_after = "Bu qoida **doim** amal qiladi. Skillni o'qiganingdan keyin har `run_command` chaqiruvida shu tarzda yoz.\n"
    reason_block = (
        "Bu qoida **doim** amal qiladi. Skillni o'qiganingdan keyin har `run_command` chaqiruvida shu tarzda yoz.\n"
        "\n"
        "## 0b. REASON MAJBURIY (har buyruq uchun)\n"
        "\n"
        "Har `run_command` chaqiruvida **reason** parametrini to'ldir. Bu:\n"
        "- nima uchun buyruq ishga tushayotganini tushuntiradi\n"
        "- audit logga yoziladi (chatga chiqmasa ham)\n"
        "- keyin `get_recent_commands` da ko'rinadi\n"
        "\n"
        "Misol:\n"
        "```\n"
        "run_command({\n"
        "  command: \"<<<CMC npm install ZZZCMCSCOPEENDZZZ\",\n"
        "  cwd: \"/home/muhamad/Claude/work/my-app\",\n"
        "  reason: \"bu path ga npm paketlarini yuklayabmiz, loyiha shu joyiga kerak\"\n"
        "})\n"
        "```\n"
        "\n"
        "Reason yozmasdan buyruq yuborma. Qisqa bo'lsin, lekin ma'nosi aniq bo'lsin.\n"
    )
    if insert_after not in t:
        raise SystemExit("cmc-ishlatish: insert point not found")
    t = t.replace(insert_after, reason_block, 1)

p.write_text(t)
print("OK: cmc-ishlatish.md")

# ---------- instruction.md (claude-skills-mr) ----------
p2 = Path("/home/muhamad/Claude/work/claude-skills-mr/instruction.md")
t2 = p2.read_text()

# Find cmc tool table row about run_command
old_cmc_tool = (
    "| `run_command` | MR kompyuterida buyruq bajaradi. Xavfli buyruq `confirmed:true`. Har chaqiruv yangi `sh`, 30s timeout. |"
)
new_cmc_tool = (
    "| `run_command` | MR kompyuterida buyruq bajaradi. **reason majburiy** (nima uchun — audit logga). Xavfli buyruq `confirmed:true`. Har chaqiruv yangi `sh`, 30s timeout. |"
)

if old_cmc_tool not in t2:
    # search
    idx = t2.find("`run_command`")
    print("INST CONTEXT:", repr(t2[idx:idx+200]) if idx >= 0 else "NOT FOUND")
    raise SystemExit("instruction.md: run_command row not found")
t2 = t2.replace(old_cmc_tool, new_cmc_tool)

# Add a short rule near cmc section about reason
marker = "**ASOSIY QOIDA: kompyuterdagi barcha ish `~/Claude` ichida**"
if "reason majburiy" not in t2[t2.find("### `cmc`"):t2.find("### `cmc`")+800]:
    # already updated the table; add explicit note after MUHIM line if needed
    pass

# Add global note in cmc section
old_muhim = (
    "### `cmc`\n"
    "**MUHIM (avtomatik ishga tushirish qoidasi):**"
)
new_muhim = (
    "### `cmc`\n"
    "**REASON MAJBURIY:** har `run_command` da `reason` — nima uchun buyruq ishga tushayotganini\n"
    "aniq yoz (masalan: `loyiha dependencylarini o'rnatish uchun npm install`). Chatga chiqmasa\n"
    "ham audit logga yoziladi. Reason'siz chaqirma.\n"
    "**MUHIM (avtomatik ishga tushirish qoidasi):**"
)
if old_muhim not in t2:
    raise SystemExit("instruction.md: cmc MUHIM marker not found")
t2 = t2.replace(old_muhim, new_muhim)

p2.write_text(t2)
print("OK: instruction.md")

# ---------- CMComputer README ----------
p3 = Path("/home/muhamad/Claude/work/CMComputer/README.md")
t3 = p3.read_text()
old_json = """```json
{
  "command": "string (majburiy)",
  "cwd": "string (ixtiyoriy)",
  "confirmed": "boolean (ixtiyoriy)"
}
```"""
new_json = """```json
{
  "command": "string (majburiy)",
  "reason": "string (majburiy) — nima uchun bu buyruq, audit logga yoziladi",
  "cwd": "string (ixtiyoriy)",
  "confirmed": "boolean (ixtiyoriy)"
}
```"""
if old_json not in t3:
    raise SystemExit("README: json block not found")
t3 = t3.replace(old_json, new_json)

old_ex = """```text
run_command({ command: \"ls -la\" })
run_command({ command: \"rm -rf /tmp/test\" })
→ bloklanadi + pendingId (dashboard yoki confirmed:true)
run_command({ command: \"rm -rf /tmp/test\", confirmed: true })
```"""
new_ex = """```text
run_command({ command: \"ls -la\", reason: \"papka tarkibini ko'rish\" })
run_command({ command: \"rm -rf /tmp/test\", reason: \"vaqtinchalik test papkasini tozalash\" })
→ bloklanadi + pendingId (dashboard yoki confirmed:true)
run_command({ command: \"rm -rf /tmp/test\", reason: \"vaqtinchalik test papkasini tozalash\", confirmed: true })
```"""
if old_ex not in t3:
    raise SystemExit("README: examples not found")
t3 = t3.replace(old_ex, new_ex)
p3.write_text(t3)
print("OK: CMComputer/README.md")

print("ALL DOCS DONE")
