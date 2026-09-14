import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authenticate } from '../chatgpt-images/login-flow.mjs'

test('未登录时先完全关闭自动化浏览器，再人工登录，最后后台验证', async () => {
  const sequence = []
  let checks = 0
  await authenticate({
    launch: async (headless) => { assert.equal(headless, true); sequence.push('launch'); return { close: async () => sequence.push('close') } },
    verify: async () => { sequence.push('verify'); if (!checks++) throw Object.assign(new Error('需要登录'), { code: 'LOGIN_REQUIRED' }) },
    manual: async () => sequence.push('manual'),
    notify: () => {},
    stopped: () => false,
  })
  assert.deepEqual(sequence, ['launch', 'verify', 'close', 'manual', 'launch', 'verify', 'close'])
})
test('已登录不启动人工登录；网络错误不会被误认为退出登录', async () => {
  let closed = 0
  const options = { launch: async () => ({ close: async () => closed++ }), verify: async () => {}, manual: async () => assert.fail('不应该启动人工登录'), stopped: () => false, notify: () => {} }
  await authenticate(options)
  assert.equal(closed, 1)
  await assert.rejects(authenticate({ ...options, verify: async () => { throw new Error('网络错误') } }), /网络错误/)
  assert.equal(closed, 2)
})
test('人工登录后取消，不重新启动浏览器', async () => {
  let cancelled = false
  let launches = 0
  await assert.rejects(authenticate({
    launch: async () => { launches++; return { close: async () => {} } },
    verify: async () => { throw Object.assign(new Error('需要登录'), { code: 'LOGIN_REQUIRED' }) },
    manual: async () => { cancelled = true },
    stopped: () => cancelled,
    notify: () => {},
  }), /任务已取消/)
  assert.equal(launches, 1)
})
