import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { acceptPromptSelection, loadPromptPreferences } from './prompt-preferences.mjs'
import { defaultPrompt } from './prompts.mjs'
import { runPowerShell } from './windows.mjs'

const run = promisify(execFile)

export async function selectPrompt() {
  const previous = await loadPromptPreferences()
  if (process.platform === 'win32') {
    const script = await readFile(new URL('./select-prompt.ps1', import.meta.url), 'utf8')
    const { stdout } = await runPowerShell(script, { env: {
      ...process.env,
      GPT_DEFAULT_PROMPT: defaultPrompt,
      GPT_CUSTOM_PROMPT: previous.customText,
      GPT_CUSTOM_ALPHA: String(previous.customRequireAlpha),
      GPT_USE_DEFAULT_PROMPT: String(previous.useDefault),
    } })
    const value = JSON.parse(stdout.trim())
    return acceptPromptSelection(value, previous)
  }
  if (process.platform !== 'darwin')
    throw new Error('请使用 --input 和 --prompt 指定图片及提示词。')
  const script = `
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    function run(argv) {
      try {
        const choice = app.displayDialog('本批图片使用同一段提示词。默认提示词：\\n\\n' + argv[0], {
          withTitle: '图片处理提示词', buttons: ['取消', '自定义', '使用默认'],
          defaultButton: argv[2] === 'false' ? '自定义' : '使用默认', cancelButton: '取消'
        }).buttonReturned;
        if (choice === '使用默认') return JSON.stringify({useDefault: true});
        let text = argv[1];
        let output;
        do {
          output = app.displayDialog('输入自定义提示词（不能为空）。白底或纯色背景选择“普通 PNG”；抠透明图选择“透明 PNG”。', {
            withTitle: '自定义提示词', defaultAnswer: text,
            buttons: ['取消', '透明 PNG', '普通 PNG'],
            defaultButton: argv[3] === 'true' ? '透明 PNG' : '普通 PNG', cancelButton: '取消'
          });
          text = output.textReturned;
        } while (!text.trim());
        return JSON.stringify({useDefault: false, text, requireAlpha: output.buttonReturned === '透明 PNG'});
      } catch (error) {
        if (error.errorNumber === -128 || String(error).includes('(-128)')) return 'null';
        throw error;
      }
    }
  `
  const { stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, defaultPrompt, previous.customText, String(previous.useDefault), String(previous.customRequireAlpha)])
  const value = JSON.parse(stdout.trim())
  return acceptPromptSelection(value, previous)
}
