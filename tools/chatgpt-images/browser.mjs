import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { clickAndSaveImage } from './click-download.mjs'
import { assertConversationAccess, permanentFailure, responseFailure } from './diagnostics.mjs'

const prepared = new WeakMap()

export const selectors = {
  composer: '#prompt-textarea, [contenteditable="true"][role="textbox"], textarea[placeholder="Ask ChatGPT"]',
  fileInput: 'input[type="file"]',
  send: '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="发送消息"]',
  assistant: '[data-message-author-role="assistant"]',
  stop: '[data-testid="stop-button"], button[aria-label="Stop answering"]',
}

export function composer(page, s) {
  return page.locator(s.composer).or(page.getByRole('textbox', { name: /Chat with ChatGPT|与 ChatGPT 聊天/i })).filter({ visible: true }).first()
}

export function sendButton(page, s) {
  return page.locator(s.send).or(page.getByRole('button', { name: /^(?:Send prompt|Send message|发送|发送消息)$/i })).filter({ visible: true }).first()
}

export async function prepare(page, file, prompt, custom = {}) {
  const s = { ...selectors, ...custom }
  await composer(page, s).waitFor({ state: 'visible', timeout: 15000 })
  prepared.delete(page)
  const original = path.parse(file)
  const filename = `${original.name}-${randomUUID().slice(0, 8)}${original.ext}`
  s.uploadFilename = filename
  const payload = { name: filename, mimeType: ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[original.ext.toLowerCase()], buffer: await readFile(file) }
  // 预览使用本地图片，不代表服务端已经收完文件；等待实际上传处理请求结束。
  const uploadDone = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.origin === 'https://chatgpt.com' && url.pathname === '/backend-api/files/process_upload_stream' && response.request().method() === 'POST'
  }, { timeout: s.uploadTimeout ?? 60000 }).then(async (response) => {
    if (!response.ok() || await response.finished())
      throw new Error('图片上传处理失败，未发送提示词。')
  })
  uploadDone.catch(() => {})
  const attach = page.getByRole('button', { name: /Add files and more|添加文件/i }).first()
  if (await attach.isVisible()) {
    const item = page.getByText(/Add photos & files|添加照片和文件/).first()
    // 页面水合完成前按钮可能可见却无事件处理器；只重试无副作用的菜单操作。
    for (let attempt = 0; attempt < 10 && !await item.isVisible(); attempt++) {
      await attach.click()
      await item.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    }
    if (!await item.isVisible())
      throw new Error('上传菜单尚未就绪，未发送提示词。')
    const chooser = page.waitForEvent('filechooser', { timeout: 15000 })
    const [dialog] = await Promise.all([chooser, item.click()])
    await dialog.setFiles(payload)
  }
  else {
    const inputs = page.locator(s.fileInput).and(page.locator('input:not(:disabled):not([hidden])'))
    if (await inputs.count() !== 1)
      throw new Error('无法唯一识别图片上传入口，已停止，未发送提示词。')
    await inputs.setInputFiles(payload, { timeout: 15000 })
  }
  await verifyAttachment(page, filename, s.uploadTimeout ?? 60000)
  await uploadDone
  await composer(page, s).fill(prompt)
  await sendButton(page, s).click({ trial: true, timeout: 60000 })
  prepared.set(page, filename)
  return s
}

export async function verifyAttachment(page, filename, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const removers = page.getByRole('button', { name: /Remove file|移除文件|删除文件/i }).filter({ visible: true })
    if (await removers.count() === 1) {
      const remove = removers.first()
      const name = await remove.getAttribute('aria-label') || await remove.innerText()
      if (name.replace(/^(?:Remove file|移除文件|删除文件)\s*\d*[:：]\s*/i, '') === filename) {
        const card = remove.locator('xpath=ancestor::*[.//img][1]')
        if (await card.count() !== 1) {
          await page.waitForTimeout(200)
          continue
        }
        const images = card.locator('img')
        const loaded = await images.evaluateAll(items => items.length > 0 && items.every(img => img.complete && img.naturalWidth > 0))
        const busy = await card.locator('[role="progressbar"], [aria-busy="true"]').count()
        if (loaded && !busy)
          return
      }
    }
    await page.waitForTimeout(200)
  }
  throw new Error('未确认所选图片已附加并完成预览加载，已停止，未发送提示词。')
}

export async function submit(page, s) {
  const filename = prepared.get(page)
  if (!filename)
    throw new Error('附件未验证，禁止发送纯文字请求。')
  await verifyAttachment(page, filename, s.uploadTimeout ?? 60000)
  await sendButton(page, s).click({ trial: true, timeout: 60000 })
  prepared.delete(page)
  // 不重试提交：点击后的超时并不代表消息未发送。
  await sendButton(page, s).click({ timeout: 60000 })
  const sent = page.getByRole('button', { name: `Open image: ${filename}`, exact: true })
    .or(page.locator('[data-message-author-role="user"]').getByRole('img', { name: filename, exact: true }))
  await sent.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
    throw new Error('消息已发送，但未确认其中包含所选图片，已停止下载；请检查当前会话，不会自动重发。')
  })
}

export async function downloadResult(page, s, timeout, destination) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (page.isClosed())
      throw new Error('浏览器已关闭')
    await assertConversationAccess(page)
    const reply = page.locator(s.assistant).last()
    if (await reply.count()) {
      const text = await reply.innerText({ timeout: 3000 }).catch(() => '')
      const failure = responseFailure(text)
      if (failure)
        throw permanentFailure(failure.code, failure.message)
      if (!await page.locator(s.stop).first().isVisible()) {
        const img = reply.locator('img').last()
        if (await img.isVisible())
          await img.hover()
        const button = s.download
          ? reply.locator(s.download).last()
          : reply.getByRole('button', { name: /下载|download|save image|保存图片/i }).last()
        if (await button.isVisible()) {
          await clickAndSaveImage(page, button, destination)
          return
        }
      }
    }
    if (!await page.locator(s.stop).first().isVisible()) {
      const generated = page.getByRole('button', { name: /^Generated image:/ }).last()
      if (await generated.isVisible()) {
        // 图片容器可能先于真实图片出现，加载完成后才可打开保存界面。
        const loaded = await generated.locator('img').evaluateAll(images => images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0))
        if (!loaded) {
          await page.waitForTimeout(1000)
          continue
        }
        await generated.click()
        const save = page.getByRole('button', { name: 'Save', exact: true })
        await save.waitFor({ state: 'visible', timeout: 15000 })
        await clickAndSaveImage(page, save, destination)
        return
      }
    }
    await page.waitForTimeout(2000)
  }
  throw Object.assign(new Error('等待生成或下载超时，进度已保留；使用 --retry-downloads 补下载原会话。'), { code: 'DOWNLOAD_TIMEOUT' })
}

export async function waitForLogin(page, custom = {}, timeout = 300000) {
  const s = { ...selectors, ...custom }
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (/just a moment|security verification|安全验证/i.test(await page.title())) {
      await page.waitForTimeout(1000)
      continue
    }
    const loginButton = page.getByRole('button', { name: /^(?:Log in|登录|登入)$/i }).first()
    if (await loginButton.isVisible().catch(() => false) || new URL(page.url()).hostname === 'accounts.google.com') {
      const error = new Error('需要在普通 Chrome 中完成登录')
      error.code = 'LOGIN_REQUIRED'
      throw error
    }
    await assertConversationAccess(page)
    const loggedIn = await page.getByRole('button', { name: /open profile menu|打开个人资料菜单/i }).first().isVisible().catch(() => false)
    if (loggedIn && await composer(page, s).isVisible())
      return
    await page.waitForTimeout(1000)
  }
  if (/just a moment|security verification|安全验证/i.test(await page.title())) throw Object.assign(new Error('网页仍在等待网站安全验证，不能据此判断账号已退出。'), { code: 'SITE_VERIFICATION_REQUIRED' })
  const error = new Error('尚未检测到登录成功。请使用应用的登录入口，在普通 Chrome 中登录后退出专用 Chrome；不要在自动化窗口内登录 Google。')
  error.code = 'LOGIN_UNCONFIRMED'
  throw error
}
