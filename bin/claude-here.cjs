#!/usr/bin/env node
// claude-here — register/remove an "Open Claude Here" Windows right-click entry.
// Usage:  npx claude-here install   |   npx claude-here uninstall
'use strict'

const { spawnSync } = require('node:child_process')
const process = require('node:process')

const BG_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\OpenClaudeHere'
const DIR_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\OpenClaudeHere'
const VERB = 'Open Claude Here'
const ICON = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\cmd.exe,0`

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
    throw new Error(
      '`claude` not found on PATH. Install Claude Code first:\n' +
        '  https://docs.claude.com/en/docs/claude-code',
    )
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
  const wtPath = resolveOnPath('wt.exe')
  if (wtPath && canLaunch([wtPath, '-?'])) {
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

// ─── registry write/delete ────────────────────────────────────
// reg.exe auto-creates parent keys when writing a value, so we
// skip the redundant "add key /f" pre-step.

function writeVerb(key, command) {
  const r1 = reg('add', key, '/ve', '/d', VERB, '/f')
  if (!r1.ok) throw new Error(`write verb to ${key} failed: ${r1.stderr}`)
  const r2 = reg('add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', ICON, '/f')
  if (!r2.ok) throw new Error(`write Icon to ${key} failed: ${r2.stderr}`)
  const r3 = reg('add', key, '/v', 'Position', '/t', 'REG_SZ', '/d', 'Top', '/f')
  if (!r3.ok) throw new Error(`write Position to ${key} failed: ${r3.stderr}`)
  const r4 = reg('add', `${key}\\command`, '/ve', '/d', command, '/f')
  if (!r4.ok) throw new Error(`write command to ${key}\\command failed: ${r4.stderr}`)
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

  process.stdout.write(`claude path: ${claudePath}\n`)
  process.stdout.write(`terminal:    ${name}\n`)
  process.stdout.write(`command:     ${command}\n\n`)

  const written = new Set()
  try {
    writeVerb(BG_KEY, command)
    written.add(BG_KEY)
    writeVerb(DIR_KEY, command)
    written.add(DIR_KEY)
  } catch (err) {
    const rolled = []
    for (const key of written) {
      rolled.push(`${key}=${deleteKey(key)}`)
    }
    const note = rolled.length > 0 ? ` (rolled back: ${rolled.join(', ')})` : ''
    throw new Error(`${err.message}${note}`)
  }

  process.stdout.write('Done. Right-click a folder to see "Open Claude Here".\n')
  process.stdout.write('Run `npx claude-here uninstall` to remove.\n')
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
  process.stdout.write('Done.\n')
}

// ─── entry point ──────────────────────────────────────────────

if (process.platform !== 'win32') {
  process.stderr.write('claude-here is Windows-only (writes to HKCU via reg.exe).\n')
  process.exit(1)
}

const cmd = process.argv[2]
try {
  if (cmd === 'install') install()
  else if (cmd === 'uninstall') uninstall()
  else {
    process.stdout.write('Usage: npx claude-here {install|uninstall}\n')
    process.exit(1)
  }
} catch (err) {
  process.stderr.write(`claude-here: ${err.message}\n`)
  process.exit(1)
}
