// 登录检查与人工登录分离：Google 登录页永远不要求用户在自动化窗口中操作。
export async function authenticate({ launch, verify, manual, stopped, notify, allowManual = true }) {
  let context
  try {
    context = await launch(true)
    try {
      await verify(context)
    }
    catch (error) {
      if (!allowManual || stopped() || !['LOGIN_REQUIRED', 'LOGIN_UNCONFIRMED'].includes(error.code)) throw error
      await context.close()
      context = null
      notify('未检测到登录状态，正在打开普通 Chrome。请完成登录后退出这个专用 Chrome 窗口。')
      await manual()
      if (stopped()) throw new Error('任务已取消')
      context = await launch(true)
      await verify(context)
    }
  }
  finally {
    await context?.close()
  }
}
