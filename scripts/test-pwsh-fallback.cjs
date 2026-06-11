// scripts/test-pwsh-fallback.cjs
// Force PWSH selection by stripping wt.exe from PATH, then re-install
// and read the stored \command value to confirm the call operator fix.

'use strict'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

// Build a sanitized PATH that keeps PowerShell 7 but drops the
// WindowsApps directory (where wt.exe's App Execution Alias lives).
const npmGlobal = 'C:\\Users\\27837\\AppData\\Roaming\\npm'
const sysRoot = process.env.SystemRoot || 'C:\\Windows'
const sanitizedPath = [
  npmGlobal,
  'C:\\Program Files\\PowerShell\\7',          // keep pwsh
  `${sysRoot}\\System32`,                     // keep cmd + reg
  `${sysRoot}`,                               // keep built-ins
].join(';')

// Spawn the install with this PATH only.
const cli = path.join(__dirname, '..', 'bin', 'claude-here.cjs')
const install = spawnSync(process.execPath, [cli, 'install'], {
  encoding: 'utf8',
  env: { ...process.env, PATH: sanitizedPath },
})
process.stdout.write('=== install output ===\n')
process.stdout.write(install.stdout)
process.stdout.write(install.stderr)
if (install.status !== 0) {
  process.stdout.write(`(install exited ${install.status})\n`)
}

// Read the stored command.
const reg = spawnSync(
  'reg.exe',
  ['query', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\OpenClaudeHere\\command'],
  { encoding: 'utf8' },
)
process.stdout.write('\n=== stored \\command value ===\n')
process.stdout.write(reg.stdout)
