import type { UnlistenFn } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

export interface Job { file: string, status: string, output?: string, error?: string }
export function useWorkshop() {
  const inputs = ref<string[]>([])
  const jobs = ref<Job[]>([])
  const output = shallowRef('')
  const useDefault = shallowRef(true)
  const prompt = shallowRef('')
  const requireAlpha = shallowRef(false)
  const busy = shallowRef(false)
  const ready = shallowRef(false)
  const stopping = shallowRef(false)
  const status = shallowRef('准备就绪')
  const logs = ref<string[]>([])
  const unlisten: UnlistenFn[] = []
  const completed = computed(() => jobs.value.filter(j => j.status === 'done').length)
  const canStart = computed(() => ready.value && !busy.value && inputs.value.length > 0 && (useDefault.value || !!prompt.value.trim()))
  const log = (message: string) => { logs.value = [...logs.value.slice(-199), message] }
  async function safe(action: () => Promise<void>) {
    try { await action() }
    catch (e) { status.value = String(e); log(String(e)) }
  }
  onMounted(() => safe(async () => {
    try {
      const saved = JSON.parse(localStorage.getItem('workshop-preferences') || '{}')
      useDefault.value = saved.useDefault !== false
      prompt.value = typeof saved.prompt === 'string' ? saved.prompt : ''
      requireAlpha.value = saved.requireAlpha === true
    }
    catch { log('已重置无效的偏好设置') }
    if (!isTauri()) { status.value = '浏览器预览 · 请使用桌面应用选择文件和启动任务'; return }
    unlisten.push(await listen<string>('task-log', e => log(e.payload)))
    unlisten.push(await listen<{ desktopEvent: string, files?: string[], message?: string } & Job>('task-event', ({ payload: e }) => {
      if (e.desktopEvent === 'login') status.value = e.message || '请在普通 Chrome 中完成登录'
      else if (e.desktopEvent === 'queue') jobs.value = (e.files || []).map(file => ({ file, status: 'pending' }))
      else if (e.desktopEvent === 'job') jobs.value = jobs.value.map(j => j.file === e.file ? { ...j, ...e } : j)
    }))
    unlisten.push(await listen<number>('task-finished', ({ payload: code }) => {
      busy.value = false
      stopping.value = false
      status.value = code === 0 ? '任务完成' : code === 130 ? '已停止，进度已保留' : '任务未全部完成，请查看日志'
    }))
    try {
      output.value = await invoke<string>('defaults')
    }
    catch (e) {
      status.value = `默认输出目录初始化失败：${String(e)}`
      log(status.value)
    }
    ready.value = true
  }))
  onUnmounted(() => unlisten.forEach(fn => fn()))
  watch([useDefault, prompt, requireAlpha], () => {
    localStorage.setItem('workshop-preferences', JSON.stringify({ useDefault: useDefault.value, prompt: prompt.value, requireAlpha: requireAlpha.value }))
  })
  const choose = (directory: boolean) => safe(async () => {
    const result = await open({ directory, multiple: !directory, filters: directory ? undefined : [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    if (result) { inputs.value = Array.isArray(result) ? result : [result]; jobs.value = [] }
  })
  const chooseOutput = () => safe(async () => { const dir = await open({ directory: true }); if (typeof dir === 'string') output.value = dir })
  async function start(mode: 'process' | 'login' | 'retry' | 'check') {
    if (!ready.value || busy.value) return
    busy.value = true
    jobs.value = []
    logs.value = []
    status.value = mode === 'login' ? '请在 Chrome 登录，完成后退出专用 Chrome 窗口' : '正在处理…'
    try {
      await invoke('start_task', { request: { mode, inputs: inputs.value, output: output.value, prompt: prompt.value, useDefault: mode === 'process' ? useDefault.value : true, requireAlpha: requireAlpha.value } })
    }
    catch (e) { busy.value = false; status.value = String(e); log(String(e)) }
  }
  const stop = () => safe(async () => { await invoke('cancel_task'); stopping.value = true; status.value = '正在停止并保存进度…' })
  const reveal = () => safe(async () => { await invoke('open_output', { path: output.value }) })
  return { inputs, jobs, output, useDefault, prompt, requireAlpha, busy, ready, stopping, status, logs, completed, canStart, choose, chooseOutput, start, stop, reveal }
}
