import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromeLaunch } from './chrome-launch.mjs'
import { findWindowsChrome, runPowerShell } from './windows.mjs'

const run = promisify(execFile)

export async function manualLogin(profile, isStopped = () => false, onStatus = () => {}) {
  if (!['darwin', 'win32'].includes(process.platform))
    throw new Error('当前人工登录入口支持 macOS 和 Windows。')
  const chromePath = process.platform === 'win32' ? await findWindowsChrome() : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  await access(chromePath).catch(() => { throw new Error('未找到已安装的 Google Chrome。') })
  console.log('正在打开普通 Chrome 登录窗口。请手动登录 ChatGPT（可选择 Google），确认看到账号后退出这个专用 Chrome 进程（只关闭标签页可能不会退出）。无需回终端按回车。')
  // 专用目录与日常 Chrome 隔离；首次登录不启用远程调试和自动化标志。
  const launch = chromeLaunch(process.platform, chromePath, profile)
  const child = spawn(launch.executable, launch.args, { stdio: 'ignore' })
  let launchError
  child.on('exit', (code) => { if (code) launchError = new Error(`Chrome 窗口启动失败（退出码 ${code}）`) })
  child.on('error', () => { launchError = new Error('普通 Chrome 启动失败。') })
  await setTimeout(2000)
  onStatus('等待你在普通 Chrome 完成 ChatGPT 登录并退出该专用 Chrome；当前尚未重新验证登录态。')
  while (true) {
    if (isStopped()) {
      child.kill()
      throw new Error('登录已取消；若 Chrome 仍在运行，请关闭专用登录窗口')
    }
    if (launchError)
      throw launchError
    let running
    if (process.platform === 'win32') {
      // 路径通过环境变量传入，避免中文、空格和特殊字符被 PowerShell 当成代码。
      const { stdout } = await runPowerShell(`
        $chromeProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
          $_.ExecutablePath -eq $env:GPT_LOGIN_CHROME -and $_.CommandLine -and
          $_.CommandLine.Contains($env:GPT_LOGIN_PROFILE) -and $_.CommandLine -notmatch '--type='
        })
        if ($chromeProcesses.Count -gt 0) { 'running' } else { 'closed' }
      `, { env: { ...process.env, GPT_LOGIN_CHROME: chromePath, GPT_LOGIN_PROFILE: profile }, timeout: 15000 })
      running = stdout.trim() === 'running'
    }
    else {
      const { stdout } = await run('/bin/ps', ['-axo', 'command='])
      running = stdout.split('\n').some(line => line.startsWith(chromePath) && line.includes(`--user-data-dir=${profile}`) && !line.includes('--type='))
    }
    if (!running)
      break
    await setTimeout(1000)
  }
  onStatus('登录窗口已退出，正在验证保存的登录状态……')
  console.log('普通 Chrome 已退出，正在验证保存的登录状态。')
}
