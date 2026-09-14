<script setup lang="ts">
import type { Job } from '../composables/useWorkshop'

defineProps<{ jobs: Job[], logs: string[], status: string, completed: number }>()
const labels: Record<string, string> = { pending: '等待', running: '正在上传', submitted: '生成与下载中', done: '已保存', failed: '失败', review: '待恢复' }
</script>

<template>
  <section class="panel">
    <div class="flex justify-between items-center mb-4">
      <h2>任务进度</h2><span class="badge">{{ completed }} / {{ jobs.length }}</span>
    </div>
    <p role="status" class="text-sm mb-4">
      {{ status }}
    </p>
    <progress v-if="jobs.length" class="w-full h-1.5 accent-emerald-700 mb-4" :value="completed" :max="jobs.length" aria-label="已完成图片" />
    <ul class="space-y-3 max-h-64 overflow-auto">
      <li v-for="job in jobs" :key="job.file" class="border-b border-stone-100 pb-3">
        <div class="flex gap-4 justify-between text-sm">
          <span class="truncate" :title="job.file">{{ job.file.split(/[\\/]/).pop() }}</span><span class="shrink-0" :class="job.status === 'done' ? 'text-emerald-700' : 'text-stone-500'">{{ labels[job.status] || job.status }}</span>
        </div><p v-if="job.error" class="text-xs text-red-700 mt-2">
          {{ job.error }}
        </p>
      </li>
    </ul>
    <details class="mt-5">
      <summary id="toggle-task-logs" class="cursor-pointer text-sm text-stone-500">
        运行日志
      </summary><pre class="log mt-3">{{ logs.join('\n') || '开始任务后，日志将显示在这里。' }}</pre>
    </details>
  </section>
</template>
