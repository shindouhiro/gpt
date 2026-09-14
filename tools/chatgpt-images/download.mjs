import { Buffer } from 'node:buffer'
import { rename, stat, unlink, writeFile } from 'node:fs/promises'

async function bounded(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = globalThis.setTimeout(() => reject(new Error('下载保存超时')), milliseconds)
    })])
  }
  finally { globalThis.clearTimeout(timer) }
}

export async function saveBrowserDownload(page, download, destination) {
  const temporary = `${destination}.part`
  // Blob 链接可能很快被页面撤销，在下载事件发生后立即读取备用副本。
  const backup = download.url().startsWith('blob:')
    ? page.evaluate(async (url) => {
        const response = await fetch(url)
        if (!response.ok)
          return null
        const blob = await response.blob()
        if (!blob.type.startsWith('image/') || blob.size > 32 * 1024 * 1024)
          return null
        return await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
      }, download.url()).catch(() => null)
    : Promise.resolve(null)
  try {
    const data = await bounded(backup, 10000).catch(() => null)
    if (typeof data === 'string' && /^data:image\/[^;]+;base64,/.test(data)) {
      await writeFile(temporary, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'), { mode: 0o600 })
      console.log('已读取网站生成的完整图片 Blob，正在保存本地文件。')
    }
    else {
      try { await bounded(download.saveAs(temporary), 60000) }
      catch (error) {
        await bounded(download.cancel(), 5000).catch(() => {})
        throw error
      }
    }
    if (!(await stat(temporary)).size)
      throw new Error('下载结果为空，未标记完成。')
    await rename(temporary, destination)
  }
  finally { await unlink(temporary).catch(() => {}) }
}

export function isConversationUrl(value) {
  return typeof value === 'string' && /^https:\/\/chatgpt\.com\/c\/(?!WEB:)[a-z0-9-]+$/i.test(value)
}

export async function recoverDownload({ url, attempt, reopen, isStopped = () => false, retries = 2, report = console.log }) {
  for (let index = 0; ; index++) {
    try {
      if (isStopped())
        throw new Error('任务已取消')
      if (index > 0)
        await reopen(url)
      if (isStopped())
        throw new Error('任务已取消')
      return await attempt()
    }
    catch (error) {
      if (error.retryable === false || isStopped() || index >= retries || !isConversationUrl(url))
        throw error
      report(`下载尚未完成，正在从同一会话重试（${index + 1}/${retries}），不会重新生成。原因：${error.message}`)
    }
  }
}
