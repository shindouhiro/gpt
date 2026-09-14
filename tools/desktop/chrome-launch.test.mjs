import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromeLaunch } from '../chatgpt-images/chrome-launch.mjs'

test('macOS 通过 LaunchServices 显式创建并激活普通 Chrome 窗口', () => {
  const launch = chromeLaunch('darwin', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/tmp/中文 profile')
  assert.equal(launch.executable, '/usr/bin/open')
  assert.deepEqual(launch.args.slice(0, 4), ['-n', '-a', '/Applications/Google Chrome.app', '--args'])
  assert.ok(launch.args.includes('--new-window'))
  assert.ok(launch.args.includes('--user-data-dir=/tmp/中文 profile'))
  assert.ok(!launch.args.includes('-g'))
  assert.ok(!launch.args.some(arg => /remote-debugging|enable-automation|headless/.test(arg)))
})
test('Windows 直接使用 Chrome，保留包含空格的路径并新建窗口', () => {
  const launch = chromeLaunch('win32', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\用户\\profile')
  assert.ok(launch.executable.endsWith('chrome.exe'))
  assert.ok(launch.args.includes('--new-window'))
  assert.ok(launch.args.includes('--user-data-dir=C:\\用户\\profile'))
})
