import { readFile } from 'node:fs/promises'

const cookieName = '__Secure-next-auth.session-token'

export function sessionCookies(source, now = Date.now()) {
  let session
  try { session = JSON.parse(source) }
  catch { throw new Error('会话文件不是有效的 JSON。') }
  if (!session || typeof session !== 'object' || typeof session.sessionToken !== 'string' || !session.sessionToken.trim())
    throw new Error('会话文件缺少 sessionToken；accessToken 不能直接替代网页登录会话。')
  const token = session.sessionToken
  if (!/^[\x21-\x7E]+$/.test(token) || /[;,"\\]/.test(token) || token.length > 64000)
    throw new Error('sessionToken 格式不受支持。')
  const expires = Date.parse(session.expires)
  if (!Number.isFinite(expires) || expires <= now)
    throw new Error('会话文件已过期或缺少有效的 expires，请重新登录获取有效会话。')
  // 该 Cookie 名是兼容假设，最终必须由实际页面登录状态验证。
  const chunks = token.match(/.{1,3800}/g)
  return chunks.map((value, index) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${index}`,
    value,
    domain: 'chatgpt.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(expires / 1000),
  }))
}

export async function importSession(context, file) {
  let source
  try { source = await readFile(file, 'utf8') }
  catch { throw new Error('无法读取会话文件，请检查文件路径与读取权限。') }
  const cookies = sessionCookies(source)
  const matches = cookie => cookie.domain.replace(/^\./, '') === 'chatgpt.com' && (cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`))
  const previous = (await context.cookies('https://chatgpt.com/')).filter(matches)
  const clear = async () => {
    for (const cookie of (await context.cookies('https://chatgpt.com/')).filter(matches))
      await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path })
  }
  const rollback = async () => {
    await clear()
    if (previous.length)
      await context.addCookies(previous)
  }
  try {
    await clear()
    await context.addCookies(cookies)
  }
  catch {
    await rollback().catch(() => {})
    throw new Error('无法导入会话 Cookie，未记录凭据内容。')
  }
  return rollback
}
