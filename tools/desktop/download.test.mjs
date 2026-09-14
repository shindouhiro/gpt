import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { clickAndSaveImage } from '../chatgpt-images/click-download.mjs'
import { validateImage } from '../chatgpt-images/core.mjs'

test('下载回归：连续两张 Blob 图片立即撤销 URL，仍完整落盘并通过透明校验', { timeout: 30000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workshop-download-'))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<button id="download">下载图片</button>')
    for (let n = 0; n < 2; n++) {
      const raw = Buffer.alloc(8 * 8 * 4, 255)
      raw[3] = 0
      raw[4] = n * 80
      const original = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer()
      await page.evaluate((bytes) => {
        window.beforeCreate = URL.createObjectURL
        document.querySelector('#download').onclick = () => {
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
          const a = document.createElement('a')
          a.href = url
          a.download = '图片.png'
          a.click()
          URL.revokeObjectURL(url)
        }
      }, [...original])
      const destination = path.join(temp, `${n}.download`)
      await clickAndSaveImage(page, page.locator('#download'), destination)
      assert.deepEqual(await readFile(destination), original)
      const info = await validateImage(destination, path.join(temp, `${n}.png`))
      assert.ok(info.transparentRatio > 0)
      assert.equal(await page.evaluate(() => URL.createObjectURL === window.beforeCreate), true)
    }
  }
  finally {
    await browser.close()
    await rm(temp, { recursive: true, force: true })
  }
})
