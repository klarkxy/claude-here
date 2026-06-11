# Claude Here

> Add an **"Open Claude Here"** entry to the Windows right-click menu for the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code).
>
> [中文文档](README.zh.md)

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-blue) ![Node 18+](https://img.shields.io/badge/Node-%E2%89%A518-green) ![No admin](https://img.shields.io/badge/HKCU-no%20admin%20needed-brightgreen) ![Zero deps](https://img.shields.io/badge/deps-0-success)

---

## What it does

After `install`, right-clicking in Windows Explorer shows a new entry:

| Right-click on | Menu shows |
|---|---|
| Empty space **inside** a folder | `Open Claude Here` |
| A **folder** itself | `Open Claude Here` |

The exact label follows your system language — see [Language](#language)
below.

Clicking it opens a terminal in that folder and runs `claude`.

> **Win11 note:** the entry may live under **"Show more options"** in the
> modern context menu. That's a Win11 menu quirk, not a bug. The entry
> still works.

---

## Install

```powershell
npx -y claude-here install
```

That's it. The `install` step writes per-user registry entries under
`HKCU`. It does **not** require admin rights and leaves nothing behind
on `uninstall` beyond what `npx claude-here uninstall` removes.

### Language

The right-click menu label follows your system locale: **`Open Claude Here`**
on English systems, **`用 Claude Code 打开`** on Chinese systems. To override:

```powershell
npx -y claude-here install --lang=zh
npx -y claude-here install --lang=en
```

Or set the env var `CLAUDE_HERE_LANG=zh` (or `en`) for the current shell.

### From source (no npm)

If you'd rather read the code before running it, or don't want to go
through npm:

```bash
git clone https://github.com/klarkxy/claude-here
cd claude-here
node bin/claude-here.cjs install
node bin/claude-here.cjs uninstall
```

The `install` / `uninstall` subcommands work the same as via `npx`;
you're just running the checkout you cloned. The `--lang` flag works
the same way.

### Uninstall

```powershell
npx claude-here uninstall
```

---

## Requirements

- Windows 10 or 11
- Node.js **18+**
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed (`where claude` should print a path)
- One of: Windows Terminal, PowerShell 7, or `cmd.exe` (the last is always there)

---

## How it works

`install` writes 4 registry values (per-user, no admin needed):

```
HKCU\Software\Classes\Directory\Background\shell\OpenClaudeHere   (folder background)
HKCU\Software\Classes\Directory\shell\OpenClaudeHere              (folder item)
```

Each has a `command` subkey whose value is a self-contained command line
that Explorer runs on right-click. `uninstall` deletes those keys.

The terminal used is detected at install time (`wt` → `pwsh` → `cmd`),
and the absolute path to `claude` is resolved via `where claude` and
baked into the registry command. The command never relies on Explorer's
PATH or your shell's PATH.
