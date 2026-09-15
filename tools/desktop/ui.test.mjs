import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { test } from 'node:test'
import { chromium } from 'playwright'

test('桌面界面：多图、自定义提示词、事件完成、停止及偏好恢复', { skip: !process.env.GPT_UI_TEST, timeout: 30000 }, async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    const mocks = (await readFile(new URL('../../node_modules/@tauri-apps/api/mocks.js', import.meta.url), 'utf8')).replace(/^export .*$/m, '')
    await page.addInitScript(`${mocks}\nwindow.isTauri=true; window.__TAURI_INTERNALS__ = {}; window.__requests=[]; mockIPC((cmd,args)=> { if(cmd==='defaults') return '/tmp/Image Workshop'; if(cmd==='plugin:dialog|open') return ['/tmp/中文 图片.png','/tmp/第二张.jpg']; if(cmd==='start_task') window.__requests.push(args.request); }, {shouldMockEvents:true}); window.__emit=(event,payload)=>window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event,payload});`)
    await page.goto('http://localhost:1420')
    await page.locator('#select-images').click()
    await page.locator('#default-prompt').click()
    assert.equal(await page.locator('#start-processing').isDisabled(), true)
    await page.locator('#custom-prompt').fill('将背景改为纯白色，保留主体。')
    await page.locator('#start-processing').click()
    const request = await page.evaluate(() => window.__requests[0])
    assert.equal(request.inputs.length, 2)
    assert.equal(request.useDefault, false)
    assert.equal(request.requireAlpha, false)
    await page.evaluate(() => {
      window.__emit('task-event', { desktopEvent: 'queue', files: ['/tmp/中文 图片.png', '/tmp/第二张.jpg'] })
      window.__emit('task-event', { desktopEvent: 'job', file: '/tmp/中文 图片.png', status: 'submitted' })
    })
    assert.equal(await page.locator('progress').getAttribute('value'), '0')
    await page.evaluate(() => {
      window.__emit('task-event', { desktopEvent: 'job', file: '/tmp/中文 图片.png', status: 'done' })
      window.__emit('task-event', { desktopEvent: 'job', file: '/tmp/第二张.jpg', status: 'done' })
      window.__emit('task-finished', 0)
    })
    await page.locator('#start-processing').waitFor()
    assert.equal(await page.locator('progress').getAttribute('value'), '2')
    await page.screenshot({ path: '/tmp/gpt-desktop-ui.png', fullPage: true })
    await page.reload()
    assert.equal(await page.locator('#custom-prompt').inputValue(), '将背景改为纯白色，保留主体。')
    await page.locator('#select-images').click()
    await page.locator('#start-processing').click()
    await page.locator('#stop-processing').click()
    assert.equal(await page.locator('#stop-processing').isDisabled(), true)
    await page.evaluate(() => window.__emit('task-finished', 130))
    await page.locator('#start-processing').waitFor()
  }
  finally { await browser.close() }
})

test('桌面界面：默认目录初始化失败时登录按钮仍可用', { skip: !process.env.GPT_UI_TEST, timeout: 30000 }, async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    const mocks = (await readFile(new URL('../../node_modules/@tauri-apps/api/mocks.js', import.meta.url), 'utf8')).replace(/^export .*$/m, '')
    await page.addInitScript(`${mocks}\nwindow.isTauri=true; window.__TAURI_INTERNALS__ = {}; window.__requests=[]; mockIPC((cmd,args)=> { if(cmd==='defaults') throw new Error('no known folder'); if(cmd==='start_task') window.__requests.push(args.request); }, {shouldMockEvents:true});`)
    await page.goto('http://localhost:1420')
    await page.locator('#login-account').click()
    const request = await page.evaluate(() => window.__requests[0])
    assert.equal(request.mode, 'login')
    assert.equal(await page.locator('#login-account').isDisabled(), true)
  }
  finally { await browser.close() }
})
