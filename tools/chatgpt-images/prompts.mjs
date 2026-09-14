import { readFile } from 'node:fs/promises'

export const defaultPrompt = '请编辑上传的图片：只移除背景，保留主体的形状、颜色、材质、文字、标志与构图。输出带真实 Alpha 透明通道的 PNG，不要白色填充，不要棋盘格图案，不要添加阴影或其他元素。请直接生成处理后的图片。'

export function createPromptConfig({ useDefault = true, text = '', requireAlpha = false } = {}) {
  if (useDefault)
    return { prompt: defaultPrompt, requireAlpha: true }
  if (typeof text !== 'string' || !text.trim())
    throw new Error('自定义提示词不能为空，请输入内容或选择默认提示词。')
  return { prompt: text.replace(/^\uFEFF/, '').trim(), requireAlpha: Boolean(requireAlpha) }
}

export async function promptFromArgs(args) {
  const count = [args.prompt !== undefined, args['prompt-file'] !== undefined, args['default-prompt']].filter(Boolean).length
  if (count > 1)
    throw new Error('--prompt、--prompt-file 和 --default-prompt 只能选择一项。')
  if ((args.login || args['manual-login'] || args['retry-downloads']) && (count || args['require-alpha']))
    throw new Error('登录或补下载时不能更改提示词；补下载会沿用原任务设置。')
  if (args.prompt !== undefined || args['prompt-file'] !== undefined) {
    const text = args['prompt-file'] !== undefined ? await readFile(args['prompt-file'], 'utf8') : args.prompt
    return createPromptConfig({ useDefault: false, text, requireAlpha: args['require-alpha'] })
  }
  return args['default-prompt'] || args['require-alpha'] ? createPromptConfig() : null
}

export function taskPromptConfig(previous, selected = createPromptConfig()) {
  if (!previous)
    return selected
  // 旧版记录没有提示词字段，只执行过默认透明背景处理。
  return { prompt: previous.prompt ?? defaultPrompt, requireAlpha: previous.requireAlpha ?? true }
}
