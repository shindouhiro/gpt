import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { validateImage } from '../chatgpt-images/core.mjs'

const run = promisify(execFile)

test('内置 Node 不依赖系统 PATH，可收集多张中文路径图片', { skip: !process.env.GPT_RUNTIME_TEST }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workshop-'))
  try {
    const first = path.join(temp, '中文 图片.png')
    const second = path.join(temp, '第二张.png')
    const image = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#f00' } }).png().toBuffer()
    await writeFile(first, image)
    await writeFile(second, image)
    const manifest = path.join(temp, 'request.json')
    await writeFile(manifest, JSON.stringify({ inputs: [first, second] }))
    const runtime = path.resolve('src-tauri/runtime')
    const { stdout } = await run(path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), [path.join(runtime, 'tools/chatgpt-images/cli.mjs'), '--input-list', manifest, '--default-prompt', '--dry-run'], { env: { ...process.env, PATH: '', NODE_OPTIONS: '', NODE_PATH: '' } })
    const jobs = JSON.parse(stdout)
    assert.deepEqual(jobs.map(j => j.file).sort(), [first, second].sort())
    assert.ok(jobs.every(j => j.requireAlpha === true))
  }
  finally { await rm(temp, { recursive: true, force: true }) }
})

test('输出校验：白底不冒充透明，透明和自定义纯色按配置写盘', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workshop-validation-'))
  try {
    const input = path.join(temp, 'solid.png')
    const output = path.join(temp, 'result.png')
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toFile(input)
    await assert.rejects(validateImage(input, output, { requireAlpha: true }))
    const info = await validateImage(input, output, { requireAlpha: false })
    assert.equal(info.width, 8)
    const raw = Buffer.alloc(8 * 8 * 4, 255)
    raw[3] = 0
    await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toFile(input)
    const transparent = await validateImage(input, output, { requireAlpha: true })
    assert.ok(transparent.transparentRatio > 0)
  }
  finally { await rm(temp, { recursive: true, force: true }) }
})
