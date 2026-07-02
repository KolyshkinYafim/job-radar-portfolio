<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { fetchAnalytics, type Analytics } from '../api/client'

const data = ref<Analytics | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchAnalytics()
  } catch {
    error.value = 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

const fmt = (n: number) => n.toLocaleString()

const dist = computed(() => {
  const d = data.value?.scoreDistribution
  if (!d) return []
  return [
    { label: '0–24', v: d.b0, c: 'var(--t3)' },
    { label: '25–49', v: d.b25, c: 'var(--t3)' },
    { label: '50–64', v: d.b50, c: 'var(--amber, #fbbf24)' },
    { label: '65–79', v: d.b65, c: 'var(--cyan)' },
    { label: '80–100', v: d.b80, c: 'var(--green, #4ade80)' },
  ]
})
const distMax = computed(() => Math.max(1, ...dist.value.map((b) => b.v)))
</script>

<template>
  <div class="analytics">
    <div v-if="loading" class="a-msg">Loading…</div>
    <div v-else-if="error" class="a-msg a-err">
      {{ error }} <button class="a-retry" @click="load">retry</button>
    </div>
    <template v-else-if="data">
      <section class="card">
        <h3 class="card-h">Score distribution</h3>
        <div class="dist">
          <div v-for="b in dist" :key="b.label" class="dist-row">
            <span class="dist-label mono">{{ b.label }}</span>
            <div class="dist-track">
              <div class="dist-bar" :style="{ width: (b.v / distMax) * 100 + '%', background: b.c }" />
            </div>
            <span class="dist-val mono">{{ fmt(b.v) }}</span>
          </div>
        </div>
      </section>

      <div class="grid2">
        <section class="card">
          <h3 class="card-h">Yield by source</h3>
          <table class="a-tbl">
            <thead><tr><th class="l">Source</th><th>Matches</th><th>Avg</th><th>≥65</th></tr></thead>
            <tbody>
              <tr v-for="s in data.bySource" :key="s.collector">
                <td class="l">{{ s.collector }}</td>
                <td class="mono">{{ fmt(s.n) }}</td>
                <td class="mono">{{ s.avg }}</td>
                <td class="mono hit">{{ fmt(s.hits) }}</td>
              </tr>
              <tr v-if="!data.bySource.length"><td colspan="4" class="a-empty">No matches yet.</td></tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <h3 class="card-h">Application funnel</h3>
          <div v-if="data.funnel.length" class="funnel">
            <div v-for="f in data.funnel" :key="f.status" class="funnel-item">
              <span class="funnel-n mono">{{ fmt(f.n) }}</span>
              <span class="funnel-s">{{ f.status }}</span>
            </div>
          </div>
          <p v-else class="a-empty">No applications tracked yet.</p>

          <h3 class="card-h" style="margin-top: 18px">LLM usage</h3>
          <table class="a-tbl">
            <thead><tr><th class="l">Model</th><th>Calls</th><th>Avg ms</th><th>Tokens</th><th>OK%</th></tr></thead>
            <tbody>
              <tr v-for="m in data.llm" :key="m.model">
                <td class="l mono model">{{ m.model }}</td>
                <td class="mono">{{ fmt(m.n) }}</td>
                <td class="mono">{{ fmt(m.avg_ms) }}</td>
                <td class="mono">{{ fmt(m.tokens) }}</td>
                <td class="mono">{{ m.ok_pct }}</td>
              </tr>
              <tr v-if="!data.llm.length"><td colspan="5" class="a-empty">No LLM calls logged.</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analytics { display: flex; flex-direction: column; gap: 14px; }

.a-msg { padding: 48px; text-align: center; color: var(--t3); font-size: 13px; }
.a-err { color: var(--red); }
.a-retry {
  margin-left: 8px; background: none; border: 1px solid var(--bd2);
  border-radius: 5px; color: var(--t2); cursor: pointer; padding: 3px 10px; font-size: 12px;
}

.card {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 16px 18px;
}
.card-h {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
  margin: 0 0 14px;
}

.grid2 { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 900px) { .grid2 { grid-template-columns: 1fr 1fr; } }

.dist { display: flex; flex-direction: column; gap: 9px; }
.dist-row { display: flex; align-items: center; gap: 12px; }
.dist-label { font-size: 11px; color: var(--t2); width: 56px; flex-shrink: 0; }
.dist-track { flex: 1; height: 14px; background: var(--b2); border-radius: 4px; overflow: hidden; }
.dist-bar { height: 100%; border-radius: 4px; min-width: 2px; transition: width 0.3s; opacity: 0.85; }
.dist-val { font-size: 12px; color: var(--t1); width: 56px; text-align: right; flex-shrink: 0; }

.a-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.a-tbl th {
  text-align: right; padding: 6px 10px; font-size: 9px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--t3);
  border-bottom: 1px solid var(--bd);
}
.a-tbl th.l, .a-tbl td.l { text-align: left; }
.a-tbl td { text-align: right; padding: 7px 10px; color: var(--t1); border-bottom: 1px solid var(--bd); }
.a-tbl tr:last-child td { border-bottom: none; }
.a-tbl td.hit { color: var(--cyan); }
.a-tbl td.model { color: var(--t2); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.a-empty { text-align: center; color: var(--t3); font-size: 12px; padding: 16px; }

.funnel { display: flex; flex-wrap: wrap; gap: 10px; }
.funnel-item {
  background: var(--b2); border: 1px solid var(--bd); border-radius: 8px;
  padding: 8px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 80px;
}
.funnel-n { font-size: 20px; font-weight: 700; color: var(--t1); line-height: 1; }
.funnel-s { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--t2); }
</style>
