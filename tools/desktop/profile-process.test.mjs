import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usesProfile, waitForProfileIdle } from '../chatgpt-images/profile-process.mjs'

test('精确匹配专用登录目录，不匹配相似目录和浏览器辅助进程', () => {
  const p = '/tmp/中文 profile'
  assert.ok(usesProfile(`Chrome --user-data-dir=${p} --new-window https://chatgpt.com/`, p))
  assert.ok(usesProfile(`chrome.exe --user-data-dir="${p}" --new-window`, p))
  assert.ok(!usesProfile(`Chrome --user-data-dir=${p}-other --new-window`, p))
  assert.ok(!usesProfile(`Chrome --user-data-dir=${p} --type=renderer`, p))
})
test('等旧进程退出后再返回；持续占用给出明确错误，不杀进程', async () => {
  let checks = 0
  await waitForProfileIdle('/tmp/p', { inspect: async () => ++checks < 3 ? [123] : [], pause: async () => {} })
  assert.equal(checks, 3)
  await assert.rejects(waitForProfileIdle('/tmp/p', { inspect: async () => [123], pause: async () => {}, attempts: 1 }), { code: 'PROFILE_IN_USE' })
})
