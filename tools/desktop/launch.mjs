import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// 优先使用 rustup 工具链，避免被系统中遗留的旧版 Rust 覆盖。
const rustBin = path.join(os.homedir(), '.cargo', 'bin')
const hasRustup = await access(path.join(rustBin, process.platform === 'win32' ? 'rustc.exe' : 'rustc')).then(() => true, () => false)
const env = { ...process.env }
// Windows 环境变量名称不区分大小写，避免同时传入 Path 和 PATH 丢失原路径。
const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH'
if (hasRustup) env[pathKey] = `${rustBin}${path.delimiter}${env[pathKey] || ''}`
const cli = fileURLToPath(new URL('../../node_modules/@tauri-apps/cli/tauri.js', import.meta.url))
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
