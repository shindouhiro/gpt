import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { cliArgs, validateRequest } from './protocol.mjs'

const base = { mode: 'process', inputs: [path.resolve('中文 图片.png'), path.resolve('第二张.jpg')], output: path.resolve('output'), profile: path.resolve('profile'), useDefault: true, prompt: '', requireAlpha: false }
test('多图请求保留原始路径，默认透明与自定义纯色互不混淆', () => {
  assert.deepEqual(validateRequest(base).inputs, base.inputs)
  assert.ok(cliArgs(base, '请求.json').includes('--default-prompt'))
  const custom = cliArgs({ ...base, useDefault: false, prompt: '纯白背景 $() "文字"' }, '请求.json')
  assert.equal(custom[custom.indexOf('--prompt') + 1], '纯白背景 $() "文字"')
  assert.ok(!custom.includes('--require-alpha'))
})
test('拒绝空输入、相对路径和空提示词', () => {
  assert.throws(() => validateRequest({ ...base, inputs: [] }))
  assert.throws(() => validateRequest({ ...base, inputs: ['relative.png'] }))
  assert.throws(() => validateRequest({ ...base, useDefault: false }))
})
test('补下载不附加输入或默认提示词，不改变原任务配置', () => {
  const args = cliArgs({ ...base, mode: 'retry', inputs: [] }, '请求.json')
  assert.ok(args.includes('--retry-downloads'))
  assert.ok(!args.includes('--default-prompt'))
  assert.ok(!args.includes('--input-list'))
})
