import { execFile } from 'node:child_process'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import { runPowerShell } from './windows.mjs'

const run = promisify(execFile)

export function usesProfile(command, profile) {
  const escaped = profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)--user-data-dir=(?:"${escaped}"|${escaped})(?=\\s--|\\shttps?:|$)`).test(command) && !/\s--type=/.test(command)
}
export async function profileProcesses(profile) {
  if (process.platform === 'win32') {
    const { stdout } = await runPowerShell(`$items = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Select-Object ProcessId, CommandLine); ConvertTo-Json -InputObject $items -Compress`, { timeout: 15000 })
    return JSON.parse(stdout || '[]').filter(p => usesProfile(p.CommandLine || '', profile)).map(p => p.ProcessId)
  }
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command='])
  return stdout.split('\n').flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\S.*)$/)
    return match && match[2].includes('/Google Chrome.app/Contents/MacOS/Google Chrome ') && usesProfile(match[2], profile) ? [Number(match[1])] : []
  })
}
export async function waitForProfileIdle(profile, { stopped = () => false, notify = () => {}, inspect = profileProcesses, pause = setTimeout, attempts = 20 } = {}) {
  for (let n = 0; n <= attempts; n++) {
    if (stopped()) throw new Error('任务已取消')
    if (!(await inspect(profile)).length) return
    if (n === 0) notify('专用 Chrome 仍在使用登录目录，请退出登录用的 Chrome 窗口；正在等待它释放目录……')
    if (n === attempts) throw Object.assign(new Error('登录目录仍被专用 Chrome 占用。请退出登录用的 Chrome 后重试；不要删除登录目录或使用 sudo。'), { code: 'PROFILE_IN_USE' })
    await pause(1000)
  }
}
