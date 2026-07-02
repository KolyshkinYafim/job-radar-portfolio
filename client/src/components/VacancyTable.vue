<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useFeedStore } from '../stores/feed'
import { useToast } from '../composables/useToast'
import ScoreBadge from './ScoreBadge.vue'
import AppStatusBadge from './AppStatusBadge.vue'
import BaseButton from './BaseButton.vue'
import type { Vacancy } from '../api/client'

const store = useFeedStore()
const { push } = useToast()

let timer: ReturnType<typeof setTimeout>

watch([
  () => store.filters.search,
  () => store.filters.minScore,
], () => {
  clearTimeout(timer)
  timer = setTimeout(() => store.load(true), 300)
})

watch([
  () => store.filters.status,
  () => store.filters.applicationStatus,
  () => store.filters.source,
], () => store.load(true))

onBeforeUnmount(() => clearTimeout(timer))

async function applyTo(v: Vacancy) {
  try {
    await store.markApplied(v.id)
    push(`Marked “${v.title}” as applied`, 'success')
  } catch {
    push('Could not mark as applied — try again', 'error')
  }
}

function salaryLabel(v: Vacancy) {
  if (!v.salaryMin && !v.salaryMax) return ''
  const cur = v.currency ?? '€'
  if (v.salaryMin && v.salaryMax) return `${v.salaryMin.toLocaleString()}–${v.salaryMax.toLocaleString()} ${cur}`
  return `${(v.salaryMin ?? v.salaryMax)!.toLocaleString()} ${cur}`
}

function topReason(v: Vacancy): string {
  const pro = v.score?.reasonsPro
  return pro && pro.length ? pro[0] : ''
}

function topFlag(v: Vacancy): string {
  const flags = v.score?.redFlags
  return flags && flags.length ? flags[0] : ''
}

const statusOptions = ['', 'new', 'queued', 'scored', 'notified', 'filtered_out', 'error']
const appStatusOptions = ['', 'null', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']
</script>

<template>
  <div class="table-shell">
    <div class="filters">
      <input
        v-model="store.filters.search"
        type="search"
        placeholder="Search title / company…"
        class="f-input f-search"
      />
      <select v-model="store.filters.status" class="f-input f-select">
        <option v-for="s in statusOptions" :key="s" :value="s">{{ s || 'Pipeline' }}</option>
      </select>
      <select v-model="store.filters.applicationStatus" class="f-input f-select">
        <option v-for="s in appStatusOptions" :key="s" :value="s">
          {{ s === 'null' ? 'Not applied' : s || 'App status' }}
        </option>
      </select>
      <div class="score-filter">
        <span class="sf-label">Score ≥</span>
        <input
          v-model.number="store.filters.minScore"
          type="range" min="0" max="100" step="5"
          class="sf-slider"
        />
        <span class="sf-val mono">{{ store.filters.minScore }}</span>
      </div>
      <span class="total mono">{{ store.total }} total</span>
    </div>

    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th class="th-left">Role</th>
            <th class="th-left hide-sm">Source</th>
            <th class="th-left hide-md">Salary</th>
            <th class="th-center">Score</th>
            <th class="th-left hide-lg">Status</th>
            <th class="th-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in store.items"
            :key="v.id"
            class="row"
            @click="store.select(v)"
          >
            <td class="td-role">
              <div class="role-title">{{ v.title }}</div>
              <div class="role-co">{{ v.company ?? '—' }}</div>
              <div v-if="topReason(v)" class="role-why">✓ {{ topReason(v) }}</div>
              <div v-else-if="topFlag(v)" class="role-flag">⚠ {{ topFlag(v) }}</div>
            </td>
            <td class="td-src hide-sm">{{ v.source }}</td>
            <td class="td-sal hide-md mono">{{ salaryLabel(v) || '—' }}</td>
            <td class="td-center"><ScoreBadge :score="v.score?.value" /></td>
            <td class="hide-lg"><AppStatusBadge :status="v.applicationStatus" /></td>
            <td class="td-actions" @click.stop>
              <button
                v-if="!v.applicationStatus"
                class="btn-apply"
                title="Mark this vacancy as applied"
                @click="applyTo(v)"
              >Mark applied</button>
              <a
                v-if="v.url"
                :href="v.url"
                target="_blank"
                class="btn-link"
                aria-label="Open posting in a new tab"
                @click.stop
              >↗</a>
            </td>
          </tr>
          <template v-if="store.loading && store.items.length === 0">
            <tr v-for="n in 6" :key="'sk' + n" class="row sk-row">
              <td class="td-role">
                <div class="skeleton sk-line sk-lg"></div>
                <div class="skeleton sk-line sk-sm"></div>
              </td>
              <td class="hide-sm"><div class="skeleton sk-line"></div></td>
              <td class="hide-md"><div class="skeleton sk-line"></div></td>
              <td class="td-center"><div class="skeleton sk-badge"></div></td>
              <td class="hide-lg"><div class="skeleton sk-line"></div></td>
              <td class="td-actions"><div class="skeleton sk-btn"></div></td>
            </tr>
          </template>
          <tr v-if="!store.loading && store.items.length === 0">
            <td colspan="6" class="empty-row">
              <div class="empty-state">
                <svg class="empty-ic" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                <p class="empty-title">No vacancies match your filters</p>
                <p class="empty-hint">Loosen the score threshold or clear the search, then run a collection.</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="store.hasMore" class="loadmore-wrap">
      <BaseButton variant="text" :disabled="store.loading" @click="store.loadMore()">
        {{ store.loading ? 'Loading…' : 'Load more' }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.table-shell { display: flex; flex-direction: column; gap: 12px; }

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.f-input {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--t1);
  transition: border-color 0.15s, box-shadow 0.15s;
  appearance: none;
}
.f-input::placeholder { color: var(--t3); }
.f-input:focus { border-color: rgba(0,229,255,0.4); box-shadow: 0 0 0 3px rgba(0,229,255,0.06); outline: none; }
.f-input option { background: var(--b2); color: var(--t1); }

.f-search { flex: 1; min-width: 180px; }
.f-select { cursor: pointer; padding-right: 28px; }

.score-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sf-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--t2);
  white-space: nowrap;
}
.sf-slider {
  width: 90px;
  accent-color: var(--cyan);
  cursor: pointer;
}
.sf-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyan);
  min-width: 26px;
  text-align: right;
}

.total {
  font-size: 11px;
  color: var(--t3);
  margin-left: auto;
  white-space: nowrap;
}

.tbl-wrap {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 10px;
  overflow: hidden;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tbl thead tr {
  background: var(--b2);
  border-bottom: 1px solid var(--bd);
}

.tbl th {
  padding: 10px 16px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}
.th-left   { text-align: left; }
.th-center { text-align: center; }
.th-right  { text-align: right; }

.row {
  border-bottom: 1px solid var(--bd);
  cursor: pointer;
  transition: background 0.1s;
}
.row:last-child { border-bottom: none; }
.row:hover { background: var(--b3); }
.row:hover .role-title { color: var(--cyan); }

.tbl td { padding: 11px 16px; }

.td-role { max-width: 280px; }
.role-title {
  font-weight: 500;
  color: var(--t1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.1s;
}
.role-co {
  font-size: 11px;
  color: var(--t2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.role-why {
  font-size: 11px;
  color: var(--green, #4ade80);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}
.role-flag {
  font-size: 11px;
  color: var(--amber, #fbbf24);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.td-src { font-size: 11px; color: var(--t2); }
.td-sal { font-size: 12px; color: var(--t1); white-space: nowrap; }
.td-center { text-align: center; }

.td-actions {
  text-align: right;
  white-space: nowrap;
}

.btn-apply {
  padding: 4px 10px;
  background: rgba(0, 229, 255, 0.07);
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 5px;
  color: var(--cyan);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-apply:hover {
  background: rgba(0, 229, 255, 0.14);
  border-color: rgba(0, 229, 255, 0.35);
  box-shadow: 0 0 12px rgba(0,229,255,0.1);
}

.btn-link {
  padding: 4px 8px;
  color: var(--t3);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.15s;
  margin-left: 4px;
}
.btn-link:hover { color: var(--t1); }

.empty-row {
  padding: 56px 64px;
  text-align: center;
  color: var(--t3);
  font-size: 13px;
}

.empty-state { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.empty-ic { color: var(--t3); opacity: 0.7; margin-bottom: 2px; }
.empty-title { margin: 0; color: var(--t2); font-size: 13px; font-weight: 500; }
.empty-hint { margin: 0; color: var(--t3); font-size: 12px; max-width: 320px; line-height: 1.5; }

.sk-row { cursor: default; }
.sk-row:hover { background: none; }
.sk-line { height: 11px; }
.sk-line.sk-lg { width: 70%; height: 13px; margin-bottom: 6px; }
.sk-line.sk-sm { width: 42%; }
.sk-badge { width: 34px; height: 20px; border-radius: 6px; margin: 0 auto; }
.sk-btn { width: 80px; height: 22px; border-radius: 5px; margin-left: auto; }

.loadmore-wrap { text-align: center; padding-top: 4px; }

@media (max-width: 639px)  { .hide-sm { display: none; } }
@media (max-width: 767px)  { .hide-md { display: none; } }
@media (max-width: 1023px) { .hide-lg { display: none; } }
</style>
