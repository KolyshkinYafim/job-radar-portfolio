<script setup lang="ts">
import { computed } from 'vue'
import { useFeedStore } from '../stores/feed'
import { useToast } from '../composables/useToast'
import ScoreBadge from './ScoreBadge.vue'
import AppStatusBadge from './AppStatusBadge.vue'

const store = useFeedStore()
const { push } = useToast()
const v = computed(() => store.selected)

const appStatuses = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']

async function changeStatus(id: string, status: string) {
  try {
    await store.updateStatus(id, status)
  } catch {
    push('Could not update status — try again', 'error')
  }
}

function salaryText(v: { salaryMin: number | null; salaryMax: number | null; currency: string | null }) {
  if (!v.salaryMin && !v.salaryMax) return null
  const cur = v.currency ?? '€'
  if (v.salaryMin && v.salaryMax) return `${v.salaryMin.toLocaleString()}–${v.salaryMax.toLocaleString()} ${cur}/mo`
  return `${(v.salaryMin ?? v.salaryMax)!.toLocaleString()} ${cur}/mo`
}
</script>

<template>
  <aside v-if="v" class="panel">
    <div class="panel-header">
      <div class="ph-text">
        <h2 class="ph-title">{{ v.title }}</h2>
        <p class="ph-sub">{{ v.company ?? 'Unknown company' }} <span class="ph-dot">·</span> <span class="ph-src">{{ v.source }}</span></p>
      </div>
      <button class="btn-close" aria-label="Close details" @click="store.select(null)">✕</button>
    </div>

    <div class="panel-body">
      <div class="meta-row">
        <ScoreBadge :score="v.score?.value" />
        <AppStatusBadge :status="v.applicationStatus" />
        <span v-if="salaryText(v)" class="chip mono">{{ salaryText(v) }}</span>
        <span v-if="v.remote" class="chip">{{ v.remote }}</span>
        <a v-if="v.url" :href="v.url" target="_blank" class="meta-link">View posting ↗</a>
      </div>

      <div v-if="v.score" class="section">
        <p class="sec-label">LLM Score Breakdown</p>
        <div class="score-box">
          <p v-for="r in v.score.reasonsPro" :key="r" class="score-line pro">
            <span class="si">✓</span>{{ r }}
          </p>
          <p v-for="r in v.score.reasonsCon" :key="r" class="score-line con">
            <span class="si">⚠</span>{{ r }}
          </p>
          <p v-for="r in (v.score.redFlags ?? [])" :key="r" class="score-line flag">
            <span class="si">✕</span>{{ r }}
          </p>
        </div>
      </div>

      <div v-if="v.stack?.length" class="section">
        <p class="sec-label">Stack</p>
        <div class="tag-row">
          <span v-for="tag in v.stack" :key="tag" class="stack-tag mono">{{ tag }}</span>
        </div>
      </div>

      <div class="section">
        <p class="sec-label">Application status</p>
        <div class="status-btns">
          <button
            v-for="st in appStatuses"
            :key="st"
            class="st-btn"
            :class="{ active: v.applicationStatus === st, [st]: v.applicationStatus === st }"
            @click="changeStatus(v!.id, st)"
          >{{ st }}</button>
        </div>
      </div>

    </div>
  </aside>

  <div v-if="v" class="backdrop" @click="store.select(null)" />
</template>

<style scoped>
.panel {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  width: 100%;
  background: var(--b1);
  border-left: 1px solid var(--bd);
  box-shadow: -12px 0 48px rgba(0, 0, 0, 0.5), -1px 0 0 var(--bd2);
  overflow-y: auto;
  z-index: 50;
  display: flex;
  flex-direction: column;
}
@media (min-width: 640px) { .panel { width: 480px; } }

.panel-header {
  position: sticky;
  top: 0;
  background: var(--b1);
  border-bottom: 1px solid var(--bd);
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  z-index: 1;
}

.ph-text { flex: 1; min-width: 0; }

.ph-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--t1);
  line-height: 1.35;
}

.ph-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--t2);
}
.ph-dot { color: var(--t3); margin: 0 3px; }
.ph-src { text-transform: capitalize; }

.btn-close {
  padding: 5px 9px;
  background: none;
  border: 1px solid var(--bd2);
  border-radius: 5px;
  color: var(--t2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.btn-close:hover { border-color: var(--red); color: var(--red); }

.panel-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.chip {
  padding: 3px 9px;
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 4px;
  font-size: 12px;
  color: var(--t2);
}

.meta-link {
  font-size: 12px;
  color: var(--cyan);
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.15s;
}
.meta-link:hover { opacity: 1; }

.section { display: flex; flex-direction: column; gap: 8px; }

.sec-label {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.score-box {
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.score-line {
  margin: 0;
  font-size: 13px;
  display: flex;
  gap: 9px;
  line-height: 1.45;
}
.si { flex-shrink: 0; width: 14px; font-size: 11px; margin-top: 1px; }

.pro  { color: #6beba0; }
.con  { color: var(--amber); }
.flag { color: var(--red); }

.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }

.stack-tag {
  padding: 3px 9px;
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 4px;
  font-size: 11px;
  color: var(--t2);
  transition: border-color 0.15s, color 0.15s;
}
.stack-tag:hover { border-color: var(--bd2); color: var(--t1); }

.status-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.st-btn {
  padding: 5px 13px;
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 6px;
  color: var(--t2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-transform: capitalize;
  transition: all 0.15s;
}
.st-btn:hover { border-color: var(--bd3); color: var(--t1); }
.st-btn.active { border-color: var(--cyan); color: var(--cyan); background: rgba(0,229,255,0.07); }
.st-btn.active.rejected  { border-color: var(--red);   color: var(--red);   background: rgba(255,83,112,0.07); }
.st-btn.active.offer     { border-color: var(--green);  color: var(--green);  background: rgba(0,230,118,0.07); }
.st-btn.active.interview { border-color: var(--amber);  color: var(--amber);  background: rgba(255,171,64,0.07); }

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 40;
}
@media (min-width: 640px) { .backdrop { display: none; } }
</style>
