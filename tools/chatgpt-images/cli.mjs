import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { verifySession } from './auth-session.mjs'
import { downloadResult, prepare, selectors, submit, waitForLogin } from './browser.mjs'
import { collect, saveState, validateImage } from './core.mjs'
import { saveDiagnostics } from './diagnostics.mjs'
import { isConversationUrl, recoverDownload } from './download.mjs'
import { acquireProfileLock } from './lock.mjs'
import { authenticate } from './login-flow.mjs'
import { manualLogin } from './manual-login.mjs'
import { selectInputs } from './picker.mjs'
import { waitForProfileIdle } from './profile-process.mjs'
import { selectPrompt } from './prompt-picker.mjs'
import { createPromptConfig, promptFromArgs, taskPromptConfig } from './prompts.mjs'
import { resumeAction, selectResumeJobs } from './resume.mjs'
import { importSession } from './session.mjs'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

async function main() {
  const { values: args } = parseArgs({ options: {
    'input': { type: 'string' },
    'input-list': { type: 'string' },
    'desktop-events': { type: 'boolean' },
    'prompt': { type: 'string' },
    'prompt-file': { type: 'string' },
    'default-prompt': { type: 'boolean', default: false },
    'require-alpha': { type: 'boolean', default: false },
    'output': { type: 'string', default: './output' },
    'profile': { type: 'string', default: path.join(projectRoot, '.chatgpt-chrome-profile') },
    'timeout': { type: 'string', default: '600' },
    'selectors': { type: 'string' },
    'manual-login': { type: 'boolean', default: false },
    'session-file': { type: 'string' },
    'login': { type: 'boolean', default: false },
    'retry-downloads': { type: 'boolean', default: false },
    'resume': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false },
  } })

  const event = (type, data) => { if (args['desktop-events']) console.log(JSON.stringify({ desktopEvent: type, ...data })) }

  if (args['retry-downloads'])
    args.resume = true
  if (args['manual-login'])
    args.login = true
  if (args['manual-login'] && args['session-file'])
    throw new Error('人工登录和会话导入不能同时使用。')

  if (args.help) {
    console.log('用法：pnpm images（弹窗选择图片或文件夹）[--input 文件或文件夹] [--default-prompt | --prompt 提示词 | --prompt-file UTF8文件] [--require-alpha] [--output ./output] [--login] [--manual-login] [--session-file 会话文件.json] [--resume] [--retry-downloads] [--dry-run] [--timeout 600] [--selectors 文件.json]')
    process.exit(0)
  }

  const explicitPrompt = await promptFromArgs(args)
  const timeout = Number(args.timeout) * 1000
  if (!Number.isFinite(timeout) || timeout < 1000)
    throw new Error('timeout 必须是大于等于 1 的秒数')
  const output = path.resolve(args.output)
  const readProgress = async () => {
    try { return JSON.parse(await readFile(path.join(output, 'progress.json'), 'utf8')) }
    catch (error) {
      if (error.code === 'ENOENT')
        return {}
      throw error
    }
  }
  const retryState = args['retry-downloads'] ? await readProgress() : null
  const inputs = args.login || retryState ? [] : args['input-list'] ? JSON.parse(await readFile(args['input-list'], 'utf8')).inputs : args.input ? [path.resolve(args.input)] : await selectInputs()
  if (!args.login && !retryState && !inputs.length) {
    console.log('已取消选择，未上传图片。')
    process.exit(0)
  }
  const selectedPrompt = explicitPrompt || (!args.login && !args.resume && !args.input && !args['input-list'] ? await selectPrompt() : createPromptConfig())
  if (!selectedPrompt) {
    console.log('已取消提示词选择，未上传图片。')
    return
  }
  if (inputs.some(input => path.resolve(input) === output))
    throw new Error('输入与输出目录不能相同')
  const resumeState = args.resume && !args.login ? retryState || await readProgress() : null
  let jobs = args.login ? [] : retryState ? Object.entries(retryState).filter(([, job]) => ['submitted', 'review'].includes(job.status) && isConversationUrl(job.url)).map(([key, job]) => ({ key, file: job.file, output: path.basename(job.output) })) : resumeState ? await selectResumeJobs(inputs, resumeState, explicitPrompt) : await collect(inputs, selectedPrompt)
  if (args['dry-run']) {
    console.log(JSON.stringify(jobs.map(job => ({ ...job, ...taskPromptConfig(resumeState?.[job.key], selectedPrompt) })), null, 2))
    process.exit(0)
  }
  if (!args.login && !jobs.length) {
    console.log(retryState ? '没有需要补下载的已提交任务。' : '没有发现 PNG、JPEG 或 WebP 图片。')
    process.exit(0)
  }
  event('queue', { files: jobs.map(job => job.file) })
  console.log(`已选择 ${jobs.length} 张图片，输出目录：${output}`)
  await mkdir(output, { recursive: true })
  const stateFile = path.join(output, 'progress.json')
  let state = {}
  try { state = JSON.parse(await readFile(stateFile, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  const custom = args.selectors ? JSON.parse(await readFile(args.selectors, 'utf8')) : {}
  const profile = path.resolve(args.profile)
  await mkdir(profile, { recursive: true, mode: 0o700 })
  console.log(`登录目录：${profile}`)
  const releaseLock = await acquireProfileLock(profile)
  let context
  let stopped = false
  const stop = () => {
    stopped = true
    process.exitCode = 130
    void context?.close().catch(() => {})
  }
  const launchContext = async (headless = false) => {
    await waitForProfileIdle(profile, { stopped: () => stopped, notify: (message) => { console.log(message); event('login', { message }) } })
    return chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      // 与人工启动 Chrome 使用相同的 macOS 钥匙串，避免 Cookie 加密方式不一致。
      ignoreDefaultArgs: ['--use-mock-keychain', '--password-store=basic'],
      headless,
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    }).catch((error) => {
      if (/ProcessSingleton|profile.*in use/i.test(error.message)) throw new Error('登录目录被另一个 Chrome 占用，请退出专用 Chrome 后重试。')
      throw error
    })
  }

  const onInput = (data) => { if (data.toString().includes('cancel')) stop() }
  if (args['desktop-events']) process.stdin.on('data', onInput)
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    // 获取目录锁后重新读取，避免使用等待锁之前的陈旧进度。
    state = await readProgress()
    if (retryState)
      jobs = jobs.filter(job => ['submitted', 'review'].includes(state[job.key]?.status))
    else if (resumeState)
      jobs = await selectResumeJobs(inputs, state, explicitPrompt)
    if (args['manual-login'])
      await manualLogin(profile, () => stopped, message => event('login', { message }))
    if (stopped) throw new Error('任务已取消')
    await authenticate({
      launch: async (headless) => { context = await launchContext(headless); return context },
      verify: async (session) => {
        const rollback = args['session-file'] ? await importSession(session, args['session-file']) : null
        try {
          console.log('正在后台检查保存的登录状态……')
          await verifySession(session)
        }
        catch (error) {
          if (rollback) {
            await rollback()
            throw new Error('导入会话未通过登录验证，已恢复原 Cookie。请使用人工登录入口。')
          }
          throw error
        }
      },
      manual: () => manualLogin(profile, () => stopped, message => event('login', { message })),
      stopped: () => stopped,
      notify: (message) => { console.log(message); event('login', { message }) },
      allowManual: !args['manual-login'] && !args['session-file'],
    })
    if (stopped) throw new Error('任务已取消')
    if (args.login) {
      console.log('登录状态已保存，下次选图后会自动继续。')
      return
    }
    context = await launchContext()
    let page = context.pages()[0] || await context.newPage()
    const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const openPage = async (url) => {
      if (stopped)
        throw new Error('任务已取消')
      const oldPage = page
      if (!context.browser()?.isConnected()) {
        await context.close().catch(() => {})
        context = await launchContext()
      }
      page = await context.newPage()
      await oldPage.close().catch(() => {})
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await waitForLogin(page, custom, 45000)
    }
    let failed = 0
    let completed = 0
    let skipped = 0
    if (!args.login) {
      for (const job of jobs) {
        if (stopped)
          break
        const previous = args.resume ? state[job.key] : undefined
        const jobPrompt = taskPromptConfig(previous, selectedPrompt)
        const filename = job.output.replace(/\.png$/, `-${runId}.png`)
        const destination = previous?.output || path.join(output, filename)
        if (!args.resume)
          delete state[job.key]
        const action = resumeAction(previous, await access(destination).then(() => true, () => false))
        if (action === 'skip') {
          skipped++
          console.log(`跳过已完成：${job.file}`)
          continue
        }
        event('job', { file: job.file, status: 'running' })
        console.log(`处理：${job.file}`)
        let s = { ...selectors, ...custom }
        let conversationUrl = previous?.url || null
        let mayHaveSubmitted = action === 'recover'
        const persist = async (status, extra = {}) => {
          state[job.key] = { ...state[job.key], ...jobPrompt, file: job.file, output: destination, status, url: conversationUrl, updatedAt: new Date().toISOString(), ...extra, ...(status === 'done' ? { error: null, errorCode: null, retryable: false, diagnostic: null } : {}) }
          await saveState(stateFile, state)
          event('job', { file: job.file, status, output: destination, error: extra.error || null })
        }
        try {
          if (action === 'recover') {
            const local = `${destination}.download`
            if (await access(local).then(() => true, () => false)) {
              const info = await validateImage(local, destination, jobPrompt).catch(() => null)
              if (info) {
                await persist('done', { info, error: null })
                completed++
                console.log(`已从本地下载文件恢复${jobPrompt.requireAlpha ? '透明 ' : ''}PNG：${destination}`)
                continue
              }
              console.log('本地下载文件未通过校验，将重新下载原会话图片。')
            }
            if (!isConversationUrl(previous.url))
              throw new Error('上次提交结果不确定，请检查会话；不能自动重新提交。')
            console.log('正在恢复上次会话，自动等待下载。')
          }
          else {
            await openPage('https://chatgpt.com/')
            s = await prepare(page, job.file, jobPrompt.prompt, custom)
            console.log(`附件预览已验证：${path.basename(job.file)}`)
            mayHaveSubmitted = true
            await persist('submitted')
            await submit(page, s)
            console.log(`已确认发送的消息包含图片：${path.basename(job.file)}`)
            await page.waitForURL(/^https:\/\/chatgpt\.com\/c\/(?!WEB:)[^/]+$/, { timeout: 60000 })
            conversationUrl = page.url()
            await persist('submitted')
          }
          const raw = `${destination}.download`
          let needsOpen = Boolean(previous)
          await recoverDownload({
            url: conversationUrl,
            isStopped: () => stopped,
            attempt: async () => {
              if (needsOpen) {
                await openPage(conversationUrl)
                needsOpen = false
              }
              await downloadResult(page, s, timeout, raw)
            },
            reopen: async (url) => {
              await openPage(url)
              needsOpen = false
            },
          })
          const info = await validateImage(raw, destination, jobPrompt)
          await persist('done', { info, error: null })
          completed++
          console.log(`已保存${jobPrompt.requireAlpha ? '透明 ' : ''}PNG：${destination}`)
        }
        catch (error) {
          const diagnostic = await saveDiagnostics(page, `${destination}.diagnostic.json`, error).catch(() => null)
          await persist(mayHaveSubmitted ? 'review' : 'failed', { errorCode: error.code || null, retryable: error.retryable !== false, diagnostic, error: error.message, url: conversationUrl || (mayHaveSubmitted && isConversationUrl(page.url()) ? page.url() : null) })
          console.error(`此张未完成：${error.message}\n当前会话：${page.url()}\n进度：${stateFile}`)
          if (diagnostic)
            console.log(`诊断记录：${diagnostic}`)
          failed++
          process.exitCode = stopped ? 130 : 1
          if (stopped)
            break
        }
      }
    }
    if (!args.login)
      console.log(`本次完成 ${completed} 张，失败 ${failed} 张${args.resume ? `，跳过 ${skipped} 张` : ''}。输出目录：${output}`)
  }
  finally {
    process.stdin.removeListener('data', onInput)
    process.stdin.pause()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    try { await context?.close() }
    finally { await releaseLock() }
  }
}

main().catch((error) => {
  if (error.code === 'ABORT_ERR' || process.exitCode === 130) {
    console.log('已取消，任务进度已保留。')
    process.exitCode = 130
    return
  }
  console.error(error.message)
  process.exitCode = 1
})
