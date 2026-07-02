<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFeedStore } from './stores/feed'
import { useSessionStore } from './stores/session'
import { useToast } from './composables/useToast'
import { triggerCollection, fetchCollectionStatus } from './api/client'
import StatsBar from './components/StatsBar.vue'
import VacancyTable from './components/VacancyTable.vue'
import VacancyDetail from './components/VacancyDetail.vue'
import GoldenLabeling from './components/GoldenLabeling.vue'
import AnalyticsPanel from './components/AnalyticsPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import LoginForm from './components/LoginForm.vue'
import ToastHost from './components/ToastHost.vue'
import BaseButton from './components/BaseButton.vue'

type View = 'feed' | 'labeling' | 'analytics' | 'settings'

const feed = useFeedStore()
const session = useSessionStore()
const { push } = useToast()
const view = ref<View>('feed')
const statsBar = ref<InstanceType<typeof StatsBar> | null>(null)

onMounted(async () => {
  await session.init()
})

watch(
  [() => view.value, () => session.me],
  ([v, me]) => {
    if (v === 'feed' && me && feed.items.length === 0 && !feed.loading) {
      feed.load(true)
    }
  },
  { immediate: true },
)

async function doLogout() {
  try {
    await session.logout()
    feed.reset()
  } catch {
    push('Sign-out failed — try again', 'error')
  }
}

function refresh() {
  if (session.me) feed.load(true)
  statsBar.value?.refresh()
}

const collecting = ref(false)
const runHint = ref('')
let statusTimer: number | undefined

async function runCollection() {
  if (collecting.value) return
  collecting.value = true
  runHint.value = 'collecting…'
  try {
    await triggerCollection()
  } catch {
    collecting.value = false
    runHint.value = 'failed'
    return
  }
  statusTimer = window.setInterval(pollCollection, 3000)
}

async function pollCollection() {
  try {
    const st = await fetchCollectionStatus()
    if (!st.running) {
      if (statusTimer) window.clearInterval(statusTimer)
      statusTimer = undefined
      collecting.value = false
      runHint.value = st.lastRun ? `+${st.lastRun.queued} queued` : 'done'
      refresh()
      window.setTimeout(() => (runHint.value = ''), 8000)
    }
  } catch {
  }
}

onBeforeUnmount(() => {
  if (statusTimer) window.clearInterval(statusTimer)
})
</script>

<template>
  <div class="app-shell">
    <template v-if="!session.ready">
      <p class="feed-loading">Loading…</p>
    </template>
    <LoginForm v-else-if="!session.me" />
    <template v-else>
      <header class="app-header">
        <div class="header-inner">
          <div class="logo">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="9" stroke="var(--cyan)" stroke-width="1.2"/>
              <circle cx="10" cy="10" r="5.5" stroke="var(--cyan)" stroke-width="0.8" stroke-dasharray="2.5 2"/>
              <circle cx="10" cy="10" r="2" fill="var(--cyan)" fill-opacity="0.9"/>
              <line x1="10" y1="1" x2="10" y2="4.5" stroke="var(--cyan)" stroke-width="1.2" stroke-linecap="round"/>
              <line x1="10" y1="15.5" x2="10" y2="19" stroke="var(--cyan)" stroke-width="1.2" stroke-linecap="round"/>
              <line x1="1" y1="10" x2="4.5" y2="10" stroke="var(--cyan)" stroke-width="1.2" stroke-linecap="round"/>
              <line x1="15.5" y1="10" x2="19" y2="10" stroke="var(--cyan)" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="logo-text">JOB<span class="logo-accent">RADAR</span></span>
          </div>
          <nav class="nav-tabs">
            <button
              class="nav-tab"
              :class="{ active: view === 'feed' }"
              @click="view = 'feed'"
            >Feed</button>
            <button
              class="nav-tab"
              :class="{ active: view === 'labeling' }"
              @click="view = 'labeling'"
            >Labeling</button>
            <button
              class="nav-tab"
              :class="{ active: view === 'analytics' }"
              @click="view = 'analytics'"
            >Analytics</button>
            <button
              class="nav-tab"
              :class="{ active: view === 'settings' }"
              @click="view = 'settings'"
            >Settings</button>
          </nav>
          <BaseButton variant="solid" :disabled="collecting" @click="runCollection">
            <span class="run-dot" :class="{ spin: collecting }" />
            {{ collecting ? 'Collecting…' : 'Run collection' }}
          </BaseButton>
          <span v-if="runHint" class="run-hint mono">{{ runHint }}</span>
          <BaseButton variant="ghost" @click="refresh">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 1 1 8.1 2.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <polyline points="8,0.5 8.1,2.8 10.4,2.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            Refresh
          </BaseButton>
          <span class="feed-user mono">{{ session.me.email }}</span>
          <button class="feed-logout" @click="doLogout">Sign out</button>
        </div>
      </header>

      <main class="main-content">
        <template v-if="view === 'feed'">
          <StatsBar ref="statsBar" />
          <VacancyTable />
        </template>
        <GoldenLabeling v-else-if="view === 'labeling'" />
        <AnalyticsPanel v-else-if="view === 'analytics'" />
        <SettingsPanel v-else />
      </main>

      <VacancyDetail v-if="view === 'feed'" />
    </template>

    <ToastHost />
  </div>
</template>

<style>
.app-shell {
  min-height: 100vh;
  background: var(--b0);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(6, 6, 15, 0.9);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--bd);
  box-shadow: 0 1px 0 rgba(0, 229, 255, 0.04), 0 4px 24px rgba(0,0,0,0.4);
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 10px 24px;
  min-height: 52px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-text {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--t1);
}

.logo-accent { color: var(--cyan); }

.nav-tabs {
  margin-left: auto;
  display: flex;
  gap: 4px;
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 7px;
  padding: 3px;
}

.nav-tab {
  padding: 5px 14px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--t2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.02em;
}

.nav-tab:hover { color: var(--t1); }

.nav-tab.active {
  background: var(--b3);
  color: var(--cyan);
}

.run-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #04121a;
  flex-shrink: 0;
}
.run-dot.spin {
  border: 1.5px solid rgba(4, 18, 26, 0.35);
  border-top-color: #04121a;
  background: transparent;
  animation: run-spin 0.7s linear infinite;
}
@keyframes run-spin {
  to { transform: rotate(360deg); }
}

.run-hint {
  font-size: 11px;
  color: var(--t3);
  letter-spacing: 0.03em;
}

.main-content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.feed-user {
  font-size: 12px;
  color: var(--t2);
}

.feed-logout {
  margin-left: auto;
  padding: 5px 12px;
  background: var(--b2);
  border: 1px solid var(--bd2);
  border-radius: 6px;
  color: var(--t2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.feed-logout:hover { border-color: var(--red); color: var(--red); }

.feed-loading {
  padding: 48px;
  text-align: center;
  color: var(--t3);
  font-size: 13px;
}

@media (max-width: 767px) {
  .nav-tabs, .feed-user, .feed-logout { margin-left: 0; }
  .nav-tabs { order: 1; width: 100%; justify-content: space-between; }
  .run-hint { order: 2; }
}
</style>
