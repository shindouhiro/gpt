<script setup lang="ts">
defineProps<{ inputs: string[], disabled: boolean }>()
defineEmits<{ choose: [directory: boolean] }>()
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <span class="step">01</span><h2>选择你的图片</h2>
    </div>
    <div class="drop-area">
      <div class="text-3xl text-emerald-700 mb-3" aria-hidden="true">
        ▧
      </div>
      <p class="font-semibold">
        从一张图片，到一整组作品
      </p>
      <p class="hint mt-2 mb-5">
        PNG、JPG、WebP · 文件夹读取当前层级
      </p>
      <div class="flex justify-center gap-3">
        <button id="select-images" :disabled="disabled" @click="$emit('choose', false)">
          选择图片
        </button><button id="select-folder" class="secondary" :disabled="disabled" @click="$emit('choose', true)">
          选择文件夹
        </button>
      </div>
    </div>
    <ul v-if="inputs.length" class="mt-4 max-h-28 overflow-auto text-sm text-stone-600">
      <li v-for="file in inputs" :key="file" class="truncate py-1" :title="file">
        {{ file }}
      </li>
    </ul>
  </section>
</template>
