<script setup lang="ts">
import InputPanel from './components/InputPanel.vue'
import PromptPanel from './components/PromptPanel.vue'
import TaskPanel from './components/TaskPanel.vue'
import { useWorkshop } from './composables/useWorkshop'

const { inputs, jobs, output, useDefault, prompt, requireAlpha, busy, ready, stopping, status, logs, completed, canStart, choose, chooseOutput, start, stop, reveal } = useWorkshop()
</script>

<template>
  <main class="max-w-6xl mx-auto px-8 py-8">
    <header class="flex items-center justify-between gap-6 mb-9">
      <div class="flex items-center gap-3">
        <div class="brand-mark">
          iw
        </div><span class="font-semibold tracking-tight">Image Workshop</span><span class="badge hidden sm:inline">DESKTOP</span>
      </div><button id="login-account" class="secondary" :disabled="busy || !ready" @click="start('login')">
        登录 ChatGPT ↗
      </button>
    </header>
    <div class="mb-8">
      <p class="eyebrow">
        让图片处理，简单一点
      </p><h1 class="text-3xl font-semibold tracking-tight mt-3 mb-3">
        你的图片，焕然一新。
      </h1><p class="text-stone-500 text-sm leading-6">
        选取图片，写下想法。自动上传、处理并保存到本地。
      </p>
    </div>
    <div class="grid lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
      <div class="space-y-5">
        <InputPanel :inputs="inputs" :disabled="busy || !ready" @choose="choose" /><PromptPanel v-model:use-default="useDefault" v-model:prompt="prompt" v-model:require-alpha="requireAlpha" :disabled="busy" />
      </div>
      <div class="space-y-5">
        <section class="panel">
          <div class="section-heading">
            <span class="step">03</span><h2>保存与开始</h2>
          </div><p class="hint mb-2">
            输出目录
          </p><p class="path-label" :title="output">
            {{ output || '等待桌面环境初始化' }}
          </p><div class="flex gap-3 mt-3 mb-6">
            <button id="choose-output" class="text-button" :disabled="busy || !ready" @click="chooseOutput">
              更改目录
            </button><button id="open-output" class="text-button" :disabled="!ready" @click="reveal">
              打开目录 ↗
            </button>
          </div><button v-if="!busy" id="start-processing" class="w-full py-3.5" :disabled="!canStart" @click="start('process')">
            开始处理 →
          </button><button v-else id="stop-processing" class="w-full secondary py-3.5" :disabled="stopping" @click="stop">
            {{ stopping ? '正在停止…' : '停止任务' }}
          </button><p class="hint text-xs mt-3">
            每次开始都会重新处理；完成后自动保存 PNG。
          </p><div class="flex gap-4 mt-5">
            <button id="retry-downloads" class="text-button" :disabled="busy || !ready" @click="start('retry')">
              补下载未完成图片
            </button><button id="check-login" class="text-button" :disabled="busy || !ready" @click="start('check')">
              检查登录
            </button>
          </div>
        </section><TaskPanel :jobs="jobs" :logs="logs" :status="status" :completed="completed" />
      </div>
    </div>
    <footer class="text-xs text-stone-400 mt-7 flex justify-between">
      <span>使用你的 ChatGPT 账号 · 需要已安装 Chrome</span><span>Image Workshop / 0.1.1</span>
    </footer>
  </main>
</template>
