export function chromeLaunch(platform, chromePath, profile) {
  const args = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-mode', '--new-window', 'https://chatgpt.com/']
  // macOS 使用 LaunchServices 注册并激活窗口，直接启动可执行文件可能只留下后台进程。
  if (platform === 'darwin') return { executable: '/usr/bin/open', args: ['-n', '-a', chromePath.replace(/\/Contents\/MacOS\/Google Chrome$/, ''), '--args', ...args] }
  return { executable: chromePath, args }
}
