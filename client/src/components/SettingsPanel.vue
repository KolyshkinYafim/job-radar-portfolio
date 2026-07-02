<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ChipEditor from './ChipEditor.vue'
import BaseButton from './BaseButton.vue'
import {
  addChannel,
  fetchChannels,
  fetchProfile,
  fetchSettingsSources,
  removeChannel,
  saveProfile,
  updateSettingsSource,
  type CandidateProfile,
  type SettingsSource,
  type TelegramChannel,
} from '../api/client'

type TagField = 'core_stack' | 'strong_plus' | 'red_flags'
type ChipVariant = 'default' | 'positive' | 'negative'

const sources = ref<SettingsSource[]>([])
const channels = ref<TelegramChannel[]>([])
const profile = ref<CandidateProfile | null>(null)
const threshold = ref(0)

const loading = ref(true)
const error = ref('')

const channelInput = ref('')
const addingChannel = ref(false)

const savingProfile = ref(false)
const profileSaved = ref(false)

const tagSections: {
  field: TagField
  label: string
  placeholder: string
  variant: ChipVariant
}[] = [
  { field: 'core_stack', label: 'Core stack / tags', placeholder: 'React, Node.js, NestJS…', variant: 'default' },
  { field: 'strong_plus', label: 'Nice to have', placeholder: 'Kubernetes, GraphQL…', variant: 'positive' },
  { field: 'red_flags', label: 'Red flags / exclude', placeholder: 'PHP, on-site only…', variant: 'negative' },
]

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [s, c, p] = await Promise.all([fetchSettingsSources(), fetchChannels(), fetchProfile()])
    sources.value = s
    channels.value = c
    profile.value = p.profile
    threshold.value = p.threshold
  } catch {
    error.value = 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

async function toggleSource(source: SettingsSource) {
  const next = !source.enabled
  try {
    const updated = await updateSettingsSource(source.name, next)
    Object.assign(source, updated)
  } catch {
    error.value = `Failed to update ${source.name}`
  }
}

function lastSeenLabel(value: string | null) {
  if (!value) return 'never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'never'
  return d.toLocaleString()
}

async function submitChannel() {
  const handle = channelInput.value.trim()
  if (!handle || addingChannel.value) return
  addingChannel.value = true
  error.value = ''
  try {
    const created = await addChannel(handle)
    if (!channels.value.some((c) => c.handle === created.handle)) {
      channels.value.push(created)
    }
    channelInput.value = ''
  } catch {
    error.value = `Failed to add ${handle}`
  } finally {
    addingChannel.value = false
  }
}

async function deleteChannel(channel: TelegramChannel) {
  error.value = ''
  try {
    await removeChannel(channel.handle)
    channels.value = channels.value.filter((c) => c.handle !== channel.handle)
  } catch {
    error.value = `Failed to remove ${channel.handle}`
  }
}

function updateTags(field: TagField, next: string[]) {
  if (!profile.value) return
  profile.value[field] = next
}

async function persistProfile() {
  if (!profile.value || savingProfile.value) return
  savingProfile.value = true
  profileSaved.value = false
  error.value = ''
  try {
    const saved = await saveProfile(profile.value)
    profile.value = saved
    profileSaved.value = true
    setTimeout(() => { profileSaved.value = false }, 2500)
  } catch {
    error.value = 'Failed to save profile'
  } finally {
    savingProfile.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="settings-shell">
    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="state-card">Loading settings…</div>

    <template v-else>
      <section class="card">
        <div class="card-head">
          <h2 class="sec-label">Sources</h2>
          <span class="sec-hint">where we search jobs</span>
        </div>
        <div class="source-list">
          <div
            v-for="source in sources"
            :key="source.name"
            class="source-row"
            :class="{ off: !source.enabled }"
          >
            <span class="source-name">{{ source.name }}</span>
            <span class="source-count mono">{{ source.count }}</span>
            <button
              class="toggle"
              :class="{ on: source.enabled }"
              role="switch"
              :aria-checked="source.enabled"
              @click="toggleSource(source)"
            >
              <span class="toggle-knob" />
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="sec-label">Telegram channels</h2>
        </div>

        <div class="add-row">
          <input
            v-model="channelInput"
            class="text-input"
            placeholder="@handle"
            @keydown.enter="submitChannel"
          />
          <BaseButton variant="tinted" :disabled="addingChannel" @click="submitChannel">Add</BaseButton>
        </div>

        <div v-if="channels.length === 0" class="empty-hint">No channels yet — add @handle</div>
        <div v-else class="channel-list">
          <div v-for="channel in channels" :key="channel.handle" class="channel-row">
            <span class="channel-handle">{{ channel.handle }}</span>
            <span class="channel-seen mono">{{ lastSeenLabel(channel.lastSeen) }}</span>
            <button class="btn-remove" title="Remove" @click="deleteChannel(channel)">×</button>
          </div>
        </div>
      </section>

      <section v-if="profile" class="card">
        <div class="card-head">
          <h2 class="sec-label">Profile &amp; tags</h2>
          <span class="sec-hint">drives the LLM scoring</span>
        </div>

        <ChipEditor
          v-for="section in tagSections"
          :key="section.field"
          :model-value="profile[section.field]"
          :label="section.label"
          :placeholder="section.placeholder"
          :variant="section.variant"
          @update:model-value="updateTags(section.field, $event)"
        />

        <div class="salary-grid">
          <label class="field">
            <span class="field-label">Salary min (EUR)</span>
            <input v-model.number="profile.salary_target.base_eur_min" type="number" class="text-input mono" />
          </label>
          <label class="field">
            <span class="field-label">Salary target (EUR)</span>
            <input v-model.number="profile.salary_target.base_eur_target" type="number" class="text-input mono" />
          </label>
          <label class="field">
            <span class="field-label">Notify threshold</span>
            <input :value="threshold" type="number" class="text-input mono" readonly />
            <span class="field-note">set via SCORING_THRESHOLD env</span>
          </label>
        </div>

        <div class="save-row">
          <BaseButton variant="tinted" :disabled="savingProfile" @click="persistProfile">Save profile</BaseButton>
          <span v-if="profileSaved" class="saved-note">Saved ✓</span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.settings-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
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
  padding: 48px 24px;
  text-align: center;
  color: var(--t2);
  font-size: 13px;
}

.card {
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 10px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.sec-label {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.sec-hint {
  font-size: 11px;
  color: var(--t3);
}

.source-list { display: flex; flex-direction: column; gap: 4px; }

.source-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 8px;
  transition: opacity 0.15s, border-color 0.15s;
}
.source-row:hover { border-color: var(--bd2); }
.source-row.off { opacity: 0.45; }

.source-name { flex: 1; font-size: 13px; color: var(--t1); }

.source-count {
  font-size: 11px;
  color: var(--t2);
  min-width: 36px;
  text-align: right;
}

.toggle {
  flex-shrink: 0;
  width: 34px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--bd2);
  border-radius: 999px;
  background: var(--b0);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.toggle.on {
  background: rgba(0, 229, 255, 0.18);
  border-color: var(--cyan);
}

.toggle-knob {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--t2);
  transform: translateX(2px);
  transition: transform 0.15s, background 0.15s;
}
.toggle.on .toggle-knob {
  background: var(--cyan);
  transform: translateX(18px);
}

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
.text-input[readonly] { color: var(--t2); cursor: default; }


.empty-hint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--t3);
  background: var(--b2);
  border: 1px dashed var(--bd2);
  border-radius: 8px;
}

.channel-list { display: flex; flex-direction: column; gap: 4px; }

.channel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 8px;
  transition: border-color 0.15s;
}
.channel-row:hover { border-color: var(--bd2); }

.channel-handle { flex: 1; font-size: 13px; color: var(--t1); }

.channel-seen { font-size: 11px; color: var(--t3); }

.btn-remove {
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
.btn-remove:hover { color: var(--red); background: rgba(255, 83, 112, 0.1); }

.field-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--t2);
}

.salary-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 560px) {
  .salary-grid { grid-template-columns: repeat(3, 1fr); }
}

.field { display: flex; flex-direction: column; gap: 6px; }

.field-note { font-size: 10px; color: var(--t3); }

.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved-note {
  font-size: 12px;
  font-weight: 600;
  color: var(--green);
}
</style>
