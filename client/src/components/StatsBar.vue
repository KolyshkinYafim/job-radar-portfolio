<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchStats, type Stats } from '../api/client'

const s = ref<Stats | null>(null)

async function load() {
  s.value = await fetchStats()
}

onMounted(load)
defineExpose({ refresh: load })

const stats = computed(() => [
  {
    label: 'Collected',
    value: Object.values(s.value?.pipeline ?? {}).reduce((a, b) => a + b, 0),
    accent: 'var(--t3)',
  },
  {
    label: 'Scored',
    value: (s.value?.pipeline?.scored ?? 0) + (s.value?.pipeline?.notified ?? 0),
    accent: 'var(--violet)',
  },
  {
    label: 'Avg score',
    value: s.value?.scoring.avg ?? 0,
    suffix: '/100',
    accent: 'var(--cyan)',
  },
  {
    label: 'Applied',
    value: s.value?.applications?.applied ?? 0,
    accent: 'var(--cyan)',
  },
  {
    label: 'Interviews',
    value: s.value?.applications?.interview ?? 0,
    accent: 'var(--amber)',
  },
  {
    label: 'Offers',
    value: s.value?.applications?.offer ?? 0,
    accent: 'var(--green)',
  },
])

const llmOnline = computed(() => s.value?.llm === 'online')
const queuePending = computed(() => (s.value?.queue?.waiting ?? 0) + (s.value?.queue?.delayed ?? 0))
const queueFailed = computed(() => s.value?.queue?.failed ?? 0)
</script>

<template>
  <div class="stats-bar">
    <div v-for="stat in stats" :key="stat.label" class="stat-card">
      <div class="stat-edge" :style="{ background: stat.accent }" />
      <span class="stat-label">{{ stat.label }}</span>
      <span class="stat-value mono">{{ stat.value }}{{ stat.suffix ?? '' }}</span>
    </div>
    <div v-if="s" class="health-card">
      <span class="health-item">
        <span class="health-dot" :style="{ background: llmOnline ? 'var(--green)' : 'var(--red)' }" />
        LLM {{ llmOnline ? 'online' : 'offline' }}
      </span>
      <span class="health-sep" />
      <span class="health-item">
        queue: <span class="health-num mono">{{ queuePending }}</span> pending
      </span>
      <span v-if="queueFailed > 0" class="health-item health-failed">
        <span class="health-num mono">{{ queueFailed }}</span> failed
      </span>
    </div>
  </div>
</template>

<style scoped>
.stats-bar {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
@media (min-width: 640px)  { .stats-bar { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1024px) { .stats-bar { grid-template-columns: repeat(6, 1fr); } }

.stat-card {
  position: relative;
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 14px 16px 14px 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.2s;
}
.stat-card:hover { border-color: var(--bd2); }

.stat-edge {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 8px 0 0 8px;
  opacity: 0.7;
}

.stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--t1);
  line-height: 1;
  letter-spacing: -0.03em;
}

.health-card {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
  transition: border-color 0.2s;
}
.health-card:hover { border-color: var(--bd2); }

.health-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.health-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-num {
  font-size: 12px;
  color: var(--t1);
}

.health-sep {
  width: 1px;
  height: 12px;
  background: var(--bd2);
}

.health-failed { color: var(--red); }
.health-failed .health-num { color: var(--red); }
</style>
