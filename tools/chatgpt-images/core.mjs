import { createHash } from 'node:crypto'
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { defaultPrompt } from './prompts.mjs'

export const prompt = defaultPrompt

export async function collect(input, { prompt: taskPrompt = defaultPrompt, requireAlpha = true } = {}) {
  const inputs = Array.isArray(input) ? input : [input]
  const files = new Set()
  for (const selected of inputs) {
    const absolute = path.resolve(selected)
    const info = await stat(absolute)
    if (info.isDirectory()) {
      const entries = await readdir(absolute, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && /\.(?:png|jpe?g|webp)$/i.test(entry.name))
          files.add(path.join(absolute, entry.name))
      }
    }
    else if (info.isFile() && /\.(?:png|jpe?g|webp)$/i.test(absolute)) {
      files.add(absolute)
    }
    else {
      throw new Error(`不支持的图片文件：${absolute}`)
    }
  }
  const jobs = []
  for (const file of [...files].sort((a, b) => a.localeCompare(b))) {
    const hash = createHash('sha256').update(await readFile(file)).digest('hex')
    const identity = createHash('sha256').update(file).update(hash).update(taskPrompt)
    // 保留旧版默认任务标识；普通 PNG 检查与透明检查使用不同任务记录。
    if (!requireAlpha)
      identity.update('\0opaque-allowed')
    const key = identity.digest('hex')
    jobs.push({ file, key, output: `${path.parse(file).name}-${key.slice(0, 12)}.png` })
  }
  return jobs
}

export async function saveState(file, state) {
  await writeFile(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}

export async function validateImage(input, output, { requireAlpha = true } = {}) {
  const metadata = await sharp(input).metadata()
  if (requireAlpha && !metadata.hasAlpha)
    throw new Error('图片没有透明通道，已保留原始下载文件，需要人工检查。')
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let transparent = 0
  let visible = 0
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if (data[i] < 255)
      transparent++
    if (data[i] > 0)
      visible++
  }
  if (!visible || (requireAlpha && !transparent))
    throw new Error('图片为空或不符合透明通道要求，需要人工检查。')
  await sharp(input).png().toFile(output)
  return { width: info.width, height: info.height, transparentRatio: transparent / (info.width * info.height) }
}
