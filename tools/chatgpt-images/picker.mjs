import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseSelectedInputs, runPowerShell } from './windows.mjs'

const run = promisify(execFile)

export async function selectInputs() {
  if (process.platform === 'win32') {
    const script = await readFile(new URL('./select-inputs.ps1', import.meta.url), 'utf8')
    const { stdout } = await runPowerShell(script)
    return parseSelectedInputs(stdout)
  }
  if (process.platform !== 'darwin')
    throw new Error('文件选择窗口支持 Windows 和 macOS；其他系统请使用 --input 指定文件或文件夹。')
  const script = `
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    function run() {
      try {
        const choice = app.displayDialog('请选择要处理的图片，支持 PNG、JPEG、WebP。', {
          withTitle: '图片批处理',
          buttons: ['取消', '选择文件夹', '选择图片'],
          defaultButton: '选择图片',
          cancelButton: '取消'
        }).buttonReturned;
        if (choice === '选择文件夹') {
          return JSON.stringify([app.chooseFolder({ withPrompt: '选择图片所在的文件夹（只处理第一层图片）' }).toString()]);
        }
        const files = app.chooseFile({ withPrompt: '选择图片，可按住 Command 多选', multipleSelectionsAllowed: true });
        return JSON.stringify(files.map(file => file.toString()));
      } catch (error) {
        if (error.errorNumber === -128 || String(error).includes('(-128)')) return '[]';
        throw error;
      }
    }
  `
  const { stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script])
  return JSON.parse(stdout.trim())
}
