<script setup lang="ts">
defineProps<{ score: number | null | undefined }>()
</script>

<template>
  <span
    v-if="score != null"
    class="score-badge mono"
    :class="score >= 75 ? 'high' : score >= 55 ? 'mid' : 'low'"
  >{{ score }}</span>
  <span v-else class="score-badge mono empty">—</span>
</template>

<style scoped>
.score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.high  { background: rgba(0, 230, 118, 0.1);  color: #00e676; border-color: rgba(0, 230, 118, 0.22); }
.mid   { background: rgba(155, 115, 255, 0.1); color: #b89fff; border-color: rgba(155, 115, 255, 0.22); }
.low   { background: var(--b3); color: var(--t3); border-color: var(--bd); }
.empty { background: var(--b2); color: var(--t3); border-color: var(--bd); }
</style>
