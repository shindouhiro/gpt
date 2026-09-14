import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPromptConfig } from './prompts.mjs'

export const preferencesFile = fileURLToPath(new URL('../../.chatgpt-prompt-settings.json', import.meta.url))

export function normalizePreferences(value) {
  const customText = typeof value?.customText === 'string' ? value.customText : ''
  return {
    version: 1,
    useDefault: value?.useDefault !== false || !customText.trim(),
    customText,
    customRequireAlpha: value?.customRequireAlpha === true,
  }
}

export async function loadPromptPreferences(file = preferencesFile, report = console.warn) {
  try { return normalizePreferences(JSON.parse(await readFile(file, 'utf8'))) }
  catch (error) {
    if (error.code !== 'ENOENT')
      report('上次的提示词设置无法读取，本次使用默认设置。')
    return normalizePreferences(null)
  }
}

export async function acceptPromptSelection(value, previous, file = preferencesFile, report = console.warn) {
  if (value === null)
    return null
  const config = createPromptConfig(value)
  const settings = normalizePreferences({
    useDefault: value.useDefault,
    customText: value.useDefault ? (value.customText ?? previous.customText) : value.text,
    customRequireAlpha: value.useDefault ? (value.customRequireAlpha ?? previous.customRequireAlpha) : value.requireAlpha,
  })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, file)
  }
  catch {
    report('无法保存提示词偏好，本次仍会按已选择的提示词处理。')
  }
  finally { await unlink(temporary).catch(() => {}) }
  return config
}
