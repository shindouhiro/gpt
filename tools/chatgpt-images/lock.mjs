import lockfile from 'proper-lockfile'

export async function acquireProfileLock(profile, options = {}) {
  try {
    return await lockfile.lock(profile, {
      lockfilePath: `${profile}/batch.lock`,
      stale: 10000,
      update: 2000,
      retries: 0,
      ...options,
    })
  }
  catch (error) {
    if (error.code === 'ELOCKED')
      throw new Error('已有任务正在使用此登录目录，请回到原终端继续，或在那里按 Ctrl+C 退出后再运行。异常终止后请等待 10 秒再试。')
    throw error
  }
}
