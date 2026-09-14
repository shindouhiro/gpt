import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { saveBrowserDownload } from './download.mjs'

export async function clickAndSaveImage(page, button, destination) {
  const key = `imageDownload_${randomUUID().replaceAll('-', '')}`
  let download
  const onDownload = (value) => { download = value }
  page.on('download', onDownload)
  // 在网站创建完整图片 Blob 时读取原始字节，避免原生下载导致窗口关闭后丢失句柄。
  await page.evaluate((key) => {
    const blobs = new Map()
    const create = URL.createObjectURL
    const click = HTMLAnchorElement.prototype.click
    const state = { data: null, error: null }
    globalThis[key] = state
    URL.createObjectURL = function (blob) {
      const url = create.call(URL, blob)
      if (blob instanceof Blob && blob.type.startsWith('image/') && blob.size <= 32 * 1024 * 1024)
        blobs.set(url, blob)
      return url
    }
    HTMLAnchorElement.prototype.click = function () {
      const blob = blobs.get(this.href)
      if (!blob || !this.hasAttribute('download'))
        return click.call(this)
      const reader = new FileReader()
      reader.onload = () => { state.data = reader.result }
      reader.onerror = () => { state.error = '无法读取网站生成的图片文件' }
      reader.readAsDataURL(blob)
    }
    state.restore = () => {
      URL.createObjectURL = create
      HTMLAnchorElement.prototype.click = click
      blobs.clear()
      delete globalThis[key]
    }
  }, key)
  const temporary = `${destination}.part`
  try {
    await button.click({ timeout: 30000 })
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (download) {
        await saveBrowserDownload(page, download, destination)
        return
      }
      const captured = await page.evaluate(key => ({ data: globalThis[key]?.data, error: globalThis[key]?.error }), key)
      if (captured.error)
        throw new Error(captured.error)
      if (captured.data) {
        const bytes = Buffer.from(captured.data.slice(captured.data.indexOf(',') + 1), 'base64')
        if (!bytes.length)
          throw new Error('网站生成的下载文件为空')
        await writeFile(temporary, bytes, { mode: 0o600 })
        await rename(temporary, destination)
        console.log('已直接保存网站下载按钮生成的完整图片。')
        return
      }
      await page.waitForTimeout(100)
    }
    throw new Error('点击下载后未收到图片文件')
  }
  finally {
    page.off('download', onDownload)
    await page.evaluate(key => globalThis[key]?.restore(), key).catch(() => {})
    await unlink(temporary).catch(() => {})
  }
}
