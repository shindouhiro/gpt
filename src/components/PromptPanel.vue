<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'radix-vue'

defineProps<{ disabled: boolean }>()
const useDefault = defineModel<boolean>('useDefault', { required: true })
const prompt = defineModel<string>('prompt', { required: true })
const requireAlpha = defineModel<boolean>('requireAlpha', { required: true })
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <span class="step">02</span><h2>告诉它如何处理</h2>
    </div>
    <div class="flex items-center gap-3 mb-4">
      <CheckboxRoot id="default-prompt" v-model:checked="useDefault" class="check" :disabled="disabled">
        <CheckboxIndicator>✓</CheckboxIndicator>
      </CheckboxRoot>
      <label for="default-prompt">使用默认提示词 · 透明背景</label>
    </div>
    <p v-if="useDefault" class="hint rounded-xl bg-stone-50 p-4">
      只移除背景，保留主体的形状、颜色、材质、文字和构图。输出真实透明 PNG，不添加阴影或其他元素。
    </p>
    <template v-else>
      <label class="sr-only" for="custom-prompt">自定义提示词</label>
      <textarea id="custom-prompt" v-model="prompt" :disabled="disabled" rows="4" placeholder="例如：将背景改成纯白色，保留商品细节与原有构图。" />
      <label class="flex items-center gap-2 mt-3 hint" for="require-alpha"><input id="require-alpha" v-model="requireAlpha" type="checkbox" :disabled="disabled">要求输出包含真实透明区域</label>
    </template>
  </section>
</template>
