# Claude Here

> Add an **"Open Claude Here"** entry to the Windows right-click menu for the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code).
>
> 在 Windows 右键菜单里加一个 **"Open Claude Here"**,在选中的目录里启动 Claude Code。

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-blue) ![Node 18+](https://img.shields.io/badge/Node-%E2%89%A518-green) ![No admin](https://img.shields.io/badge/HKCU-no%20admin%20needed-brightgreen) ![Zero deps](https://img.shields.io/badge/deps-0-success)

---

## What it does / 它做什么

After `install`, right-clicking in Windows Explorer shows a new entry:

| Right-click on | Menu shows |
|---|---|
| Empty space **inside** a folder | `Open Claude Here` |
| A **folder** itself | `Open Claude Here` |

Clicking it opens a terminal in that folder and runs `claude`.

> **Win11 note:** the entry may live under **"Show more options"** in the
> modern context menu. That's a Win11 menu quirk, not a bug. The entry
> still works.

---

## Install / 安装

```powershell
# from a clone of this repo
npx . install

# or once published to npm
npx -y claude-here install
```

That's it. The `install` step writes per-user registry entries under
`HKCU`. It does **not** require admin rights and leaves nothing behind
on `uninstall` beyond what `npx claude-here uninstall` removes.

### Uninstall / 卸载

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

