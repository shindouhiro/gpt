import path from 'node:path'

export function validateRequest(value) {
  if (!value || !['process', 'login', 'retry', 'check'].includes(value.mode)) throw new Error('未知任务类型')
  if (!Array.isArray(value.inputs) || value.inputs.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('图片路径必须为绝对路径')
  if (value.mode === 'process' && !value.inputs.length) throw new Error('请先选择图片或文件夹')
  if (['process', 'retry'].includes(value.mode) && (typeof value.output !== 'string' || !path.isAbsolute(value.output))) throw new Error('输出目录无效')
  if (typeof value.profile !== 'string' || !path.isAbsolute(value.profile)) throw new Error('登录目录无效')
  if (!value.useDefault && (typeof value.prompt !== 'string' || !value.prompt.trim())) throw new Error('自定义提示词不能为空')
  return value
}
export function cliArgs(value, manifest) {
  const r = validateRequest(value)
  const args = ['--output', r.output, '--profile', r.profile, '--desktop-events']
  if (r.mode === 'login') {
    args.push('--manual-login')
  }
  else if (r.mode === 'check') {
    args.push('--login')
  }
  else if (r.mode === 'retry') {
    args.push('--retry-downloads')
  }
  else {
    args.push('--input-list', manifest)
    if (r.useDefault) args.push('--default-prompt')
    else args.push('--prompt', r.prompt, ...(r.requireAlpha ? ['--require-alpha'] : []))
  }
  return args
}
