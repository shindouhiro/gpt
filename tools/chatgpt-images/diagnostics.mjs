import { writeFile } from 'node:fs/promises'

export function responseFailure(text) {
  if (/you['’]ve (?:hit|reached).{0,100}(?:limit|quota)|(?:free|plus|pro) plan limit|usage limit|image generation.{0,40}limit|达到.{0,15}上限|(?:图片|图像)生成.{0,15}(?:额度|限制)|额度.{0,10}(?:用完|耗尽)/i.test(text))
    return { code: 'GENERATION_LIMIT', message: '这条会话提示图片生成额度受限，未生成可下载成品。旧回复不代表当前额度；如需重新生成，请重新选图运行。' }
  if (/wasn['’]t able to invoke the image generation tool|can['’]t produce the transparent PNG in this turn/i.test(text))
    return { code: 'NOT_GENERATED', message: '这条会话明确表示未能生成图片，没有成品可补下载。' }
  return null
}

export function permanentFailure(code, message) {
  return Object.assign(new Error(message), { code, retryable: false })
}

export async function assertConversationAccess(page) {
  const unavailable = page.getByText(/You (?:don['’]t|do not) have access to this conversation|Unable to load conversation|无权访问此对话|无法加载对话/i).filter({ visible: true })
  if (await unavailable.count())
    throw permanentFailure('CONVERSATION_UNAVAILABLE', '当前账号无法打开该会话，请检查会话地址和登录账号。')
}

export async function saveDiagnostics(page, destination, error) {
  // 只保留排错所需的计数和状态，不保存页面正文、Cookie 或下载签名链接。
  const snapshot = {
    capturedAt: new Date().toISOString(),
    code: error.code || 'DOWNLOAD_FAILED',
    retryable: error.retryable !== false,
    pageClosed: page.isClosed(),
  }
  if (!page.isClosed()) {
    const counts = await page.evaluate(() => ({
      assistantMessages: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      generatedImages: document.querySelectorAll('[aria-label^="Generated image:"]').length,
      loadedImages: [...document.querySelectorAll('[aria-label^="Generated image:"] img')].filter(img => img.complete && img.naturalWidth > 0).length,
    })).catch(() => null)
    Object.assign(snapshot, counts)
  }
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
  return destination
}
