<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchGoldenQueue, setGoldenLabel, type GoldenLabel, type GoldenQueueItem } from '../api/client'

const items = ref<GoldenQueueItem[]>([])
const index = ref(0)
const totalLabeled = ref(0)
const sessionLabeled = ref(0)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const current = computed<GoldenQueueItem | null>(() => items.value[index.value] ?? null)
const done = computed(() => !loading.value && !current.value)

function salaryLabel(v: GoldenQueueItem) {
  if (!v.salaryMin && !v.salaryMax) return ''
  const cur = v.currency ?? '€'
  if (v.salaryMin && v.salaryMax) return `${v.salaryMin.toLocaleString()}–${v.salaryMax.toLocaleString()} ${cur}`
  return `${(v.salaryMin ?? v.salaryMax)!.toLocaleString()} ${cur}`
}

async function loadQueue() {
  loading.value = true
  error.value = ''
  try {
    const queue = await fetchGoldenQueue(50)
    items.value = queue.items
    totalLabeled.value = queue.labeled
    index.value = 0
  } catch {
    error.value = 'Failed to load the labeling queue'
  } finally {
    loading.value = false
  }
}

async function label(value: GoldenLabel) {
  if (!current.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await setGoldenLabel(current.value.id, value)
    sessionLabeled.value++
    totalLabeled.value++
    index.value++
  } catch {
    error.value = 'Failed to save the label, try again'
  } finally {
    submitting.value = false
  }
}

function skip() {
  if (!current.value || submitting.value) return
  index.value++
}

function onKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
  if (e.key === '1') label('yes')
  else if (e.key === '2') label('maybe')
  else if (e.key === '3') label('no')
  else if (e.key === 's') skip()
}

onMounted(() => {
  loadQueue()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="labeling-shell">
    <div class="labeling-head">
      <h2 class="labeling-title">Golden set labeling</h2>
      <span class="progress mono">
        {{ sessionLabeled }} / {{ items.length }} labeled this session · {{ totalLabeled }} total labeled
      </span>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="loading" class="state-card">Loading queue…</div>

    <div v-else-if="done" class="state-card">
      <div class="done-emoji">🎉</div>
      <div class="done-title">All done for now</div>
      <div class="done-sub">{{ totalLabeled }} vacancies labeled in total.</div>
      <div class="done-hint">Run <code>npm run golden:eval -w backend</code> to evaluate scoring against the golden set.</div>
    </div>

    <div v-else-if="current" class="vacancy-card">
      <div class="card-head">
        <a v-if="current.url" :href="current.url" target="_blank" class="card-title card-title-link">
          {{ current.title }} <span class="link-arrow">↗</span>
        </a>
        <div v-else class="card-title">{{ current.title }}</div>
        <div class="card-meta">
          <span>{{ current.company ?? '—' }} · {{ current.source }}</span>
          <span v-if="salaryLabel(current)" class="card-salary mono">{{ salaryLabel(current) }}</span>
          <span v-if="current.score" class="card-score mono">score {{ current.score.value }}</span>
        </div>
      </div>

      <div class="raw-text">{{ current.rawText }}</div>

      <div class="actions">
        <button class="btn-label btn-yes" :disabled="submitting" @click="label('yes')">
          ✅ Yes <kbd>1</kbd>
        </button>
        <button class="btn-label btn-maybe" :disabled="submitting" @click="label('maybe')">
          🤔 Maybe <kbd>2</kbd>
        </button>
        <button class="btn-label btn-no" :disabled="submitting" @click="label('no')">
          ❌ No <kbd>3</kbd>
        </button>
        <button class="btn-skip" :disabled="submitting" @click="skip()">
          skip <kbd>s</kbd>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.labeling-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto;
}

.labeling-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.labeling-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.progress {
  font-size: 11px;
  color: var(--t3);
  white-space: nowrap;
}

.error-banner {
  padding: 10px 14px;
  background: rgba(255, 83, 112, 0.08);
  border: 1px solid rgba(255, 83, 112, 0.25);
  border-radius: 8px;
  color: var(--red);
  font-size: 12px;
}

.state-card {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 64px 24px;
  text-align: center;
  color: var(--t2);
  font-size: 13px;
}

.done-emoji { font-size: 32px; }
.done-title {
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--t1);
}
.done-sub { margin-top: 6px; font-size: 13px; color: var(--t2); }
.done-hint { margin-top: 16px; font-size: 12px; color: var(--t3); }
.done-hint code {
  padding: 2px 6px;
  background: var(--b2);
  border: 1px solid var(--bd2);
  border-radius: 4px;
  color: var(--cyan);
  font-size: 11px;
}

.vacancy-card {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--t1);
  line-height: 1.35;
}

.card-title-link {
  display: inline-block;
  text-decoration: none;
  transition: color 0.15s;
}
.card-title-link:hover { color: var(--cyan); }

.link-arrow { font-size: 13px; color: var(--t3); }

.card-meta {
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--t2);
}

.card-salary { color: var(--green); font-weight: 600; }
.card-score { color: var(--violet); }

.raw-text {
  white-space: pre-wrap;
  overflow-y: auto;
  max-height: 46vh;
  padding: 14px 16px;
  background: var(--b0);
  border: 1px solid var(--bd);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--t1);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: var(--b2);
  border: 1px solid var(--bd2);
  color: var(--t1);
}
.btn-label:disabled { opacity: 0.4; cursor: default; }

.btn-label kbd,
.btn-skip kbd {
  padding: 1px 6px;
  background: var(--b3);
  border: 1px solid var(--bd2);
  border-radius: 4px;
  font-size: 10px;
  color: var(--t2);
  font-family: monospace;
}

.btn-yes { border-color: rgba(0, 230, 118, 0.25); }
.btn-yes:hover:not(:disabled) {
  background: rgba(0, 230, 118, 0.1);
  border-color: rgba(0, 230, 118, 0.45);
  box-shadow: 0 0 14px rgba(0, 230, 118, 0.12);
}

.btn-maybe { border-color: rgba(255, 171, 64, 0.25); }
.btn-maybe:hover:not(:disabled) {
  background: rgba(255, 171, 64, 0.1);
  border-color: rgba(255, 171, 64, 0.45);
  box-shadow: 0 0 14px rgba(255, 171, 64, 0.12);
}

.btn-no { border-color: rgba(255, 83, 112, 0.25); }
.btn-no:hover:not(:disabled) {
  background: rgba(255, 83, 112, 0.1);
  border-color: rgba(255, 83, 112, 0.45);
  box-shadow: 0 0 14px rgba(255, 83, 112, 0.12);
}

.btn-skip {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--t3);
  font-size: 12px;
  cursor: pointer;
  padding: 8px 12px;
  transition: color 0.15s;
}
.btn-skip:hover:not(:disabled) { color: var(--t1); }
.btn-skip:disabled { opacity: 0.4; cursor: default; }
</style>
