import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionResult, verifySession } from '../chatgpt-images/auth-session.mjs'

test('区分有效会话、明确未登录和网站验证，避免验证页触发重复登录', async () => {
  assert.equal(sessionResult(200, { user: { id: 'test-user' } }), 'authenticated')
  assert.equal(sessionResult(200, {}), 'anonymous')
  assert.equal(sessionResult(403, null), 'unavailable')
  assert.equal(sessionResult(200, null), 'unavailable')
  assert.equal(sessionResult(500, { error: 'upstream' }), 'unavailable')
  await assert.rejects(verifySession({ request: { get: async () => ({ status: () => 403, json: async () => { throw new Error('HTML') } }) } }), { code: 'AUTH_CHECK_UNAVAILABLE' })
})
