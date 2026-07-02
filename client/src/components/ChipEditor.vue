<script setup lang="ts">
import { ref } from 'vue'

type Variant = 'default' | 'positive' | 'negative'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    label?: string
    placeholder?: string
    variant?: Variant
  }>(),
  { variant: 'default', placeholder: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const draft = ref('')

function addTag() {
  const value = draft.value.trim()
  if (!value) return
  if (props.modelValue.includes(value)) {
    draft.value = ''
    return
  }
  emit('update:modelValue', [...props.modelValue, value])
  draft.value = ''
}

function removeTag(value: string) {
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== value),
  )
}
</script>

<template>
  <div class="chip-group" :class="`variant-${variant}`">
    <span v-if="label" class="field-label">{{ label }}</span>
    <div class="chip-row">
      <span v-for="tag in modelValue" :key="tag" class="chip">
        {{ tag }}
        <button class="chip-x" type="button" @click="removeTag(tag)">×</button>
      </span>
    </div>
    <div class="add-row">
      <input
        v-model="draft"
        class="text-input"
        :placeholder="placeholder"
        @keydown.enter="addTag"
      />
      <button class="btn-add" type="button" title="Add" @click="addTag">+</button>
    </div>
  </div>
</template>

<style scoped>
.chip-group { display: flex; flex-direction: column; gap: 8px; }

.field-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 9px;
  background: var(--b2);
  border: 1px solid var(--bd2);
  border-radius: 4px;
  font-size: 12px;
  color: var(--t1);
}

.variant-positive .chip {
  border-color: rgba(0, 229, 255, 0.35);
  color: var(--cyan);
}

.variant-negative .chip {
  border-color: rgba(255, 83, 112, 0.35);
  color: var(--red);
}

.chip-x {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--t3);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.chip-x:hover { color: var(--red); background: rgba(255, 83, 112, 0.1); }

.add-row { display: flex; gap: 8px; }

.text-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  background: var(--b2);
  border: 1px solid var(--bd2);
  border-radius: 6px;
  color: var(--t1);
  font-size: 13px;
  font-family: inherit;
}
.text-input::placeholder { color: var(--t3); }
.text-input:focus { border-color: var(--bd3); }

.btn-add {
  flex-shrink: 0;
  width: 34px;
  background: var(--b2);
  border: 1px solid var(--bd2);
  border-radius: 6px;
  color: var(--cyan);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-add:hover {
  background: var(--b3);
  border-color: var(--cyan);
}
</style>
