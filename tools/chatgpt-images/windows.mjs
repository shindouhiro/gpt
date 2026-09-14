import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function powershellArgs(script) {
  const source = `$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n${script}`
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')]
}

export function runPowerShell(script, options = {}) {
  const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return run(executable, powershellArgs(script), { windowsHide: true, ...options })
}

export function chromeCandidates(env = process.env) {
  return [...new Set([env.LOCALAPPDATA, env.PROGRAMFILES, env['ProgramFiles(x86)']].filter(Boolean))]
    .map(root => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
}

export async function findWindowsChrome() {
  for (const candidate of chromeCandidates()) {
    if (await access(candidate).then(() => true, () => false))
      return candidate
  }
  throw new Error('未找到 Google Chrome，请先安装 Chrome 后重试。')
}

export function parseSelectedInputs(stdout) {
  const values = JSON.parse(stdout.replace(/^\uFEFF/, '').trim())
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value))
    throw new Error('文件选择窗口返回了无效结果')
  return values
}
