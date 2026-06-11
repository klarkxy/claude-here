// lib/i18n.cjs — user-facing strings and language resolution.
//
// To add a new language: add a key to STRINGS. That's it. Every
// key is required; if you miss one the program will throw at
// startup so you don't ship a half-translated string.
//
// Resolution priority for the active language:
//   1. --lang=<code>        command-line flag
//   2. CLAUDE_HERE_LANG     env var
//   3. Intl system locale   (zh-* → zh, anything else → en)
//
// Functions in the strings table are used where the message
// interpolates the verb, so changing the verb label doesn't
// break the surrounding sentence.

'use strict'

const STRINGS = {
  en: {
    verb: 'Open Claude Here',
    installDone: (verb) => `Done. Right-click a folder to see "${verb}".`,
    uninstallDone: 'Done.',
    runUninstallHint: 'Run `npx claude-here uninstall` to remove.',
    claudeNotFound:
      '`claude` not found on PATH. Install Claude Code first:\n' +
      '  https://docs.claude.com/en/docs/claude-code',
    winOnly: 'claude-here is Windows-only (writes to HKCU via reg.exe).',
    usage: 'Usage: npx claude-here {install|uninstall}  [--lang <en|zh>]',
    unknownLang: (lang, supported) =>
      `claude-here: unknown language: ${lang} (supported: ${supported.join(', ')})`,
  },
  zh: {
    verb: '用 Claude Code 打开',
    installDone: (verb) => `完成。右键文件夹即可看到"${verb}"。`,
    uninstallDone: '完成。',
    runUninstallHint: '运行 `npx claude-here uninstall` 卸载。',
    claudeNotFound:
      '在 PATH 上找不到 `claude`。请先安装 Claude Code:\n' +
      '  https://docs.claude.com/en/docs/claude-code',
    winOnly: 'claude-here 仅支持 Windows（通过 reg.exe 写 HKCU）。',
    usage: '用法：npx claude-here {install|uninstall}  [--lang <en|zh>]',
    unknownLang: (lang, supported) =>
      `claude-here：不支持的语言：${lang}（支持：${supported.join(', ')}）`,
  },
}

function pickLang() {
  // 1. --lang flag (in any position, before or after the subcommand)
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) return args[i + 1]
    if (args[i].startsWith('--lang=')) return args[i].slice('--lang='.length)
  }
  // 2. Env
  if (process.env.CLAUDE_HERE_LANG) return process.env.CLAUDE_HERE_LANG
  // 3. System locale
  let locale = ''
  try {
    locale = new Intl.DateTimeFormat().resolvedOptions().locale || ''
  } catch {}
  if (!locale) locale = process.env.LANG || process.env.LC_ALL || ''
  return /^zh/i.test(locale) ? 'zh' : 'en'
}

module.exports = { STRINGS, pickLang }
