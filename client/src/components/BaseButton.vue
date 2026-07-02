<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'solid' | 'tinted' | 'ghost' | 'text' }>(), {
  variant: 'ghost',
})
</script>

<template>
  <button class="base-btn" :class="`variant-${variant}`">
    <slot />
  </button>
</template>

<style scoped>
.base-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.02em;
}
.base-btn:disabled { opacity: 0.4; cursor: default; }

.variant-solid {
  background: var(--cyan);
  border: 1px solid var(--cyan);
  color: #04121a;
  font-weight: 700;
}
.variant-solid:hover:not(:disabled) { filter: brightness(1.12); }

.variant-tinted {
  background: rgba(0, 229, 255, 0.1);
  border: 1px solid rgba(0, 229, 255, 0.28);
  color: var(--cyan);
  font-weight: 600;
}
.variant-tinted:hover:not(:disabled) {
  background: rgba(0, 229, 255, 0.18);
  border-color: rgba(0, 229, 255, 0.45);
}

.variant-ghost {
  background: var(--b2);
  border: 1px solid var(--bd2);
  color: var(--t2);
}
.variant-ghost:hover:not(:disabled) {
  background: var(--b3);
  border-color: var(--bd3);
  color: var(--t1);
}

.variant-text {
  background: none;
  border: none;
  padding: 8px 20px;
  color: var(--cyan);
  font-size: 13px;
  opacity: 0.75;
}
.variant-text:hover:not(:disabled) { opacity: 1; }
</style>
