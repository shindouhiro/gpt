import path from 'node:path'
import { collect } from './core.mjs'
import { taskPromptConfig } from './prompts.mjs'

function resumeJob(key, previous) {
  if (typeof previous.output !== 'string' || !previous.output)
    throw new Error(`任务记录缺少输出路径，请检查 progress.json：${previous.file}`)
  return { key, file: previous.file, output: path.basename(previous.output) }
}

export async function selectResumeJobs(inputs, state, explicitPrompt = null) {
  const selected = await collect(inputs, explicitPrompt || undefined)
  const jobs = []
  for (const image of selected) {
    let matches
    if (explicitPrompt) {
      matches = state[image.key] ? [[image.key, state[image.key]]] : []
    }
    else {
      const candidates = Object.entries(state).filter(([, previous]) => typeof previous?.file === 'string' && path.resolve(previous.file) === image.file)
      matches = []
      for (const [key, previous] of candidates) {
        // 用原提示词重新计算标识，同时确认原图内容未被同路径的新文件替换。
        const [original] = await collect(image.file, taskPromptConfig(previous))
        if (original.key === key)
          matches.push([key, previous])
      }
    }
    if (!matches.length)
      throw new Error(`未找到可恢复的原任务：${image.file}。续跑不会创建新任务；如需重新处理，请运行 pnpm images，不要添加 --resume。`)
    if (matches.length > 1)
      throw new Error(`同一图片存在 ${matches.length} 个原任务：${image.file}。请使用 --retry-downloads 补下载，或用 --prompt、--prompt-file、--default-prompt 及原透明检查设置明确指定原任务。`)
    jobs.push(resumeJob(...matches[0]))
  }
  return jobs
}

export function resumeAction(previous, outputExists = false) {
  if (!previous)
    return 'submit'
  if (previous.status === 'done' && outputExists)
    return 'skip'
  // 完成记录的文件丢失也只恢复原成品，避免重复发送和消耗生成额度。
  return ['submitted', 'review', 'done'].includes(previous.status) ? 'recover' : 'submit'
}
