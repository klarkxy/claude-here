#!/usr/bin/env node
// claude-here — register/remove an "Open Claude Here" Windows right-click entry.
// Usage:  npx claude-here {install|uninstall}  [--lang <en|zh>]
'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const { STRINGS, pickLang } = require('../lib/i18n.cjs')

const BG_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\OpenClaudeHere'
const DIR_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\OpenClaudeHere'
// Used only when we can't locate claude.exe in the @anthropic-ai/claude-code
// npm package — the embedded icon on that binary is the preferred source.
const FALLBACK_ICON = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\cmd.exe,0`

// ─── i18n ──────────────────────────────────────────────────────
//
// Strings and resolution logic live in lib/i18n.cjs. Add a new
// language by adding a key to STRINGS there.

const LANG = pickLang()
if (!STRINGS[LANG]) {
  // Always report the error in English — we can't trust the unknown
  // lang to have its own message.
  process.stderr.write(`${STRINGS.en.unknownLang(LANG, Object.keys(STRINGS))}\n`)
  process.exit(1)
}
const t = STRINGS[LANG]

// ─── reg.exe wrapper ──────────────────────────────────────────
// reg.exe: status 0 = success, 1 = "cannot find key" (for delete),
// other non-zero = real error. We treat status !== 0 as failure
// and surface stderr in the error message.

function reg(...args) {
  const r = spawnSync('reg.exe', args, { encoding: 'utf8' })
  return { ok: r.status === 0, status: r.status, stderr: (r.stderr || '').trim() }
}

// Did the binary actually start? spawnSync returns:
//   { error: { code: 'ENOENT' } }   if not on PATH
//   { status: <num> }               if it ran and exited
//   { status: null, signal: '...' } if killed by signal
// We treat any of the latter two as "launchable". ENOENT / EACCES
// are surfaced via r.error and cause us to fall through.

function canLaunch(args) {
  const r = spawnSync(args[0], args.slice(1), { stdio: 'ignore' })
  if (r.error) return false  // ENOENT, EACCES, ENOEXEC, etc.
  return true
}

// First absolute path of `exe` on PATH, or null.
function resolveOnPath(exe) {
  const r = spawnSync('where', [exe], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  return first || null
}

// ─── claude path resolution ───────────────────────────────────
// Explorer's PATH is NOT the user's shell PATH. We resolve `claude`
// to an absolute path at install time and store that. The user can
// re-run `install` after moving their npm prefix.

function resolveClaude() {
  const r = spawnSync('where', ['claude'], { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(t.claudeNotFound)
  }
  const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  if (!first) throw new Error('`where claude` returned no path')
  return first
}

// ─── terminal selection ───────────────────────────────────────
// Tried in order. Each terminal's absolute path is resolved via
// `where` and stored in the registry so the command doesn't depend
// on Explorer's PATH at click time.

function pickTerminal(absoluteClaude) {
  const cmd = `"${absoluteClaude}"`

  // 1. Windows Terminal.
  //
  // Don't probe with `-?` / `--version` / `--help` — every one of
  // these opens a GUI dialog (Help or About) in Windows Terminal.
  // Trust `where` alone: if it finds wt.exe, the file exists and in
  // practice launches. The rare case of a broken App Execution Alias
  // stub is acceptable to defer to runtime — the user can just
  // re-run `claude-here install`.
  const wtPath = resolveOnPath('wt.exe')
  if (wtPath) {
    return [
      'Windows Terminal',
      `"${wtPath}" -d "%V" cmd /k ${cmd}`,
    ]
  }

  // 2. PowerShell 7+.
  //
  // PWSH's -Command takes a PowerShell expression. A bare quoted
  // path like -Command "C:\...\claude" would just print the path;
  // we need the call operator `&` to actually invoke it.
  //
  // The backslash-escaped quotes `\\"` are for cmd's argv parser
  // (which sees the registry value as a command line): `\"` becomes
  // a literal `"` inside the -Command argv element, so PWSH ends
  // up with:   -Command   & "C:\...\claude"
  const pwshPath = resolveOnPath('pwsh.exe')
  if (pwshPath && canLaunch([pwshPath, '-NoLogo', '-Command', 'exit 0'])) {
    return [
      'PowerShell 7',
      `"${pwshPath}" -WorkingDirectory "%V" -NoExit -Command "& \\"${absoluteClaude}\\""`,
    ]
  }

  // 3. cmd.exe fallback. Always at %SystemRoot%\System32\cmd.exe
  // so we don't bother resolving it. pushd (not cd /d) so UNC
  // paths get auto-disconnected on exit.
  return [
    'Command Prompt',
    `cmd.exe /d /s /k pushd "%V" && ${cmd}`,
  ]
}

// ─── icon resolution ──────────────────────────────────────────
// The context menu's "Icon" value points at a .ico/.exe/.dll. We try
// to use the @anthropic-ai/claude-code package's claude.exe — it ships
// with an embedded app icon. The npm shim (claude.cmd) is in the same
// prefix dir as node_modules/, so we walk up from the shim path.
//
// On unusual setups where the shim and node_modules live in different
// places (custom npm prefix), fall back to `npm root -g`.

function resolveClaudeIcon() {
  const r = spawnSync('where', ['claude'], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const shim = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  if (!shim) return null

  // Primary: sibling of the npm shim → node_modules/@anthropic-ai/claude-code/bin/claude.exe
  const primary = path.join(
    path.dirname(shim), 'node_modules',
    '@anthropic-ai', 'claude-code', 'bin', 'claude.exe',
  )
  if (fs.existsSync(primary)) return `${primary},0`

  // Fallback: npm root -g
  const rg = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' })
  if (rg.status === 0) {
    const root = (rg.stdout || '').trim()
    if (root) {
      const alt = path.join(root, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
      if (fs.existsSync(alt)) return `${alt},0`
    }
  }
  return null
}

// ─── registry write/delete ────────────────────────────────────
// reg.exe auto-creates parent keys when writing a value, so we
// skip the redundant "add key /f" pre-step.

function writeVerb(key, command, icon) {
  const r1 = reg('add', key, '/ve', '/d', t.verb, '/f')
  if (!r1.ok) throw new Error(`write verb to ${key} failed: ${r1.stderr}`)
  const r2 = reg('add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', icon, '/f')
  if (!r2.ok) throw new Error(`write Icon to ${key} failed: ${r2.stderr}`)
  const r4 = reg('add', `${key}\\command`, '/ve', '/d', command, '/f')
  if (!r4.ok) throw new Error(`write command to ${key}\\command failed: ${r4.stderr}`)
  // v0.x set Position=Top to push the entry to the top of the menu;
  // v1.0.0 lets Windows sort it naturally. `reg add` only updates the
  // values you name, so a stale Position from a prior install would
  // otherwise linger. Remove it explicitly. Missing value → status 1
  // → ignored.
  reg('delete', key, '/v', 'Position', '/f')
}

function queryKey(key) {
  return reg('query', key).ok  // status 0 = key exists
}

function deleteKey(key) {
  // reg delete returns 1 if the key doesn't exist. Treat as "absent".
  const r = reg('delete', key, '/f')
  if (r.ok) return 'deleted'
  if (r.status === 1) return 'absent'
  return `error: ${r.stderr}`
}

// Transactional install: on failure, roll back ONLY the keys this
// run wrote. Pre-existing keys (from a prior install) are left
// alone — a partial failure during an update should not wipe a
// working registration.
function install() {
  const claudePath = resolveClaude()
  const [name, command] = pickTerminal(claudePath)
  const icon = resolveClaudeIcon() || FALLBACK_ICON

  process.stdout.write(`claude path: ${claudePath}\n`)
  process.stdout.write(`terminal:    ${name}\n`)
  process.stdout.write(`icon:        ${icon}\n`)
  process.stdout.write(`command:     ${command}\n\n`)

  const written = new Set()
  try {
    writeVerb(BG_KEY, command, icon)
    written.add(BG_KEY)
    writeVerb(DIR_KEY, command, icon)
    written.add(DIR_KEY)
  } catch (err) {
    const rolled = []
    for (const key of written) {
      rolled.push(`${key}=${deleteKey(key)}`)
    }
    const note = rolled.length > 0 ? ` (rolled back: ${rolled.join(', ')})` : ''
    throw new Error(`${err.message}${note}`)
  }

  process.stdout.write(`${t.installDone(t.verb)}\n`)
  process.stdout.write(`${t.runUninstallHint}\n`)
}

function uninstall() {
  const bg = deleteKey(BG_KEY)
  const dir = deleteKey(DIR_KEY)
  for (const [name, result] of [['background', bg], ['folder', dir]]) {
    if (result === 'error') {
      throw new Error(
        `failed to remove ${name} entry — try manually: ` +
          `reg delete "${name === 'background' ? BG_KEY : DIR_KEY}" /f`,
      )
    }
  }
  if (queryKey(BG_KEY) || queryKey(DIR_KEY)) {
    throw new Error('a registry key still exists after delete; check permissions')
  }
  process.stdout.write(`${t.uninstallDone}\n`)
}

// ─── entry point ──────────────────────────────────────────────

if (process.platform !== 'win32') {
  process.stderr.write(`${t.winOnly}\n`)
  process.exit(1)
}

// Find the subcommand, skipping --lang and its value. This keeps
// `claude-here --lang zh install` working the same as
// `claude-here install --lang zh`. Unknown `--*` flags are just
// ignored (we only have one).
const args = process.argv.slice(2)
let cmd
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--lang') {
    i++  // skip the value
    continue
  }
  if (!a.startsWith('--')) {
    cmd = a
    break
  }
}
try {
  if (cmd === 'install') install()
  else if (cmd === 'uninstall') uninstall()
  else {
    process.stdout.write(`${t.usage}\n`)
    process.exit(1)
  }
} catch (err) {
  process.stderr.write(`claude-here: ${err.message}\n`)
  process.exit(1)
}
