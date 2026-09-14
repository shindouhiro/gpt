export function sessionResult(status, data) {
  if (status === 200 && data?.user && (data.user.id || data.user.email)) return 'authenticated'
  if (status === 401 || (status === 200 && data && typeof data === 'object' && !Array.isArray(data) && !data.user && !data.error)) return 'anonymous'
  return 'unavailable'
}
export async function verifySession(context) {
  const response = await context.request.get('https://chatgpt.com/api/auth/session', { timeout: 30000 })
  const data = await response.json().catch(() => null)
  const result = sessionResult(response.status(), data)
  if (result === 'authenticated') return
  const error = new Error(result === 'anonymous' ? '需要在普通 Chrome 中完成登录' : '登录检查被网站验证或网络错误阻挡，不能据此判断账号已退出。请稍后重试。')
  error.code = result === 'anonymous' ? 'LOGIN_REQUIRED' : 'AUTH_CHECK_UNAVAILABLE'
  throw error
}
