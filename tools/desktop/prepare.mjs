import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = path.join(root, 'src-tauri/runtime')
await mkdir(path.join(runtime, 'tools/chatgpt-images'), { recursive: true })
await mkdir(path.join(runtime, 'tools/desktop'), { recursive: true })
for (const name of await readdir(path.join(root, 'tools/chatgpt-images'))) {
  if ((name.endsWith('.mjs') && !name.includes('.test.') && !name.startsWith('package-')) || name.endsWith('.ps1'))
    await cp(path.join(root, 'tools/chatgpt-images', name), path.join(runtime, 'tools/chatgpt-images', name))
}
for (const name of ['worker.mjs', 'protocol.mjs']) await cp(path.join(root, 'tools/desktop', name), path.join(runtime, 'tools/desktop', name))
const dependencies = {}
for (const name of ['playwright', 'sharp', 'proper-lockfile']) dependencies[name] = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version
await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: 'image-workshop-runtime', private: true, type: 'module', dependencies }, null, 2))
await writeFile(path.join(runtime, '.npmrc'), 'node-linker=hoisted\n')
const signature = JSON.stringify({ dependencies, platform: process.platform, arch: process.arch })
const previous = await readFile(path.join(runtime, '.prepared'), 'utf8').catch(() => '')
if (previous !== signature) execFileSync(process.execPath, [process.env.npm_execpath, 'install', '--ignore-workspace', '--no-frozen-lockfile', '--ignore-scripts', '--prod', '--config.update-notifier=false'], { cwd: runtime, stdio: 'inherit', env: { ...process.env, CI: 'true', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } })
await cp(process.execPath, path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'))
if (process.platform !== 'win32') await chmod(path.join(runtime, 'node'), 0o755)
// Node 的发行许可包含在运行时中，供离线分发查阅。
const licenseCache = path.join(root, 'dist', `NODE-LICENSE-${process.version}`)
await mkdir(path.dirname(licenseCache), { recursive: true })
let licenseText = await readFile(licenseCache, 'utf8').catch(() => null)
if (!licenseText) {
  const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, { signal: AbortSignal.timeout(30000) })
  if (!license.ok) throw new Error('无法获取 Node 发行许可')
  licenseText = await license.text()
  await writeFile(licenseCache, licenseText)
}
await writeFile(path.join(runtime, 'NODE-LICENSE'), licenseText)
execFileSync(path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), ['--input-type=module', '-e', 'await import("playwright"); await import("sharp"); await import("proper-lockfile"); console.log("内置运行环境验证通过")'], { cwd: runtime, stdio: 'inherit' })

// 清除安装工具元数据，避免打包开发机路径或可执行符号链接。
for (const name of ['.bin', '.modules.yaml', '.pnpm-workspace-state-v1.json']) await rm(path.join(runtime, 'node_modules', name), { recursive: true, force: true })

await writeFile(path.join(runtime, '.prepared'), signature)
