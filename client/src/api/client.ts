import axios from 'axios'

const http = axios.create({ baseURL: '/api', withCredentials: true })

export interface Vacancy {
  id: string
  title: string
  company: string | null
  source: string
  url: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  remote: string | null
  seniority: string | null
  stack: string[]
  status: string
  applicationStatus: string | null
  createdAt: string
  postedAt: string | null
  score: { value: number; reasonsPro: string[]; reasonsCon: string[]; redFlags?: string[] } | null
  feedback: { verdict: string } | null
}

export interface VacancyList {
  total: number
  page: number
  limit: number
  items: Vacancy[]
}

export interface Stats {
  pipeline: Record<string, number>
  applications: Record<string, number>
  scoring: { total: number; avg: number; max: number; min: number }
  queue: { waiting: number; delayed: number; active: number; failed: number }
  llm: 'online' | 'offline'
  recentActivity: Partial<Vacancy>[]
  topScored: Partial<Vacancy>[]
}

export async function fetchStats(): Promise<Stats> {
  const { data } = await http.get<Stats>('/stats')
  return data
}

export interface CollectionRun {
  queued: number
  duplicate: number
  filtered: number
  error: number
  collectors: number
  finishedAt: string | null
}

export interface CollectionStatus {
  running: boolean
  lastRun: CollectionRun | null
}

export async function triggerCollection(): Promise<
  CollectionStatus & { started: boolean; alreadyRunning: boolean }
> {
  const { data } = await http.post('/collect')
  return data
}

export async function fetchCollectionStatus(): Promise<CollectionStatus> {
  const { data } = await http.get<CollectionStatus>('/collect/status')
  return data
}

export interface Analytics {
  scoreDistribution: { b0: number; b25: number; b50: number; b65: number; b80: number }
  bySource: { collector: string; n: number; avg: number; hits: number }[]
  funnel: { status: string; n: number }[]
  llm: { model: string; n: number; avg_ms: number; tokens: number; ok_pct: number }[]
}

export async function fetchAnalytics(): Promise<Analytics> {
  const { data } = await http.get<Analytics>('/analytics')
  return data
}

export interface Me {
  id: string
  email: string
  tgChatId: string | null
  tgUserId: string | null
  createdAt: string
}

export async function requestLink(email: string): Promise<{ sent: true; link?: string }> {
  const { data } = await http.post<{ sent: true; link?: string }>('/auth/request-link', { email })
  return data
}

export async function verifyLink(link: string): Promise<void> {
  await http.get(link.replace(/^\/api/, ''))
}

export async function fetchMe(): Promise<Me> {
  const { data } = await http.get<Me>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await http.post('/auth/logout')
}

export async function fetchFeed(params: Record<string, unknown>): Promise<VacancyList> {
  const { data } = await http.get<VacancyList>('/feed', { params })
  return data
}

export async function setFeedApplicationStatus(id: string, status: string): Promise<Vacancy> {
  const { data } = await http.patch<Vacancy>(`/feed/${id}/application`, { status })
  return data
}

export type GoldenLabel = 'yes' | 'maybe' | 'no'

export interface GoldenQueueItem {
  id: string
  title: string
  company: string | null
  source: string
  url: string | null
  rawText: string
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  score: { value: number } | null
}

export interface GoldenQueue {
  labeled: number
  items: GoldenQueueItem[]
}

export async function fetchGoldenQueue(limit = 50): Promise<GoldenQueue> {
  const { data } = await http.get<GoldenQueue>('/vacancies/golden/queue', { params: { limit } })
  return data
}

export async function setGoldenLabel(id: string, label: GoldenLabel): Promise<{ id: string; goldenLabel: GoldenLabel }> {
  const { data } = await http.patch<{ id: string; goldenLabel: GoldenLabel }>(`/vacancies/${id}/golden`, { label })
  return data
}

export interface SettingsSource {
  name: string
  enabled: boolean
  count: number
}

export interface TelegramChannel {
  id: string
  kind: string
  handle: string
  enabled: boolean
  lastSeen: string | null
}

export interface CandidateProfile {
  name: string
  seniority: string
  location_preference: string[]
  core_stack: string[]
  strong_plus: string[]
  red_flags: string[]
  salary_target: {
    base_eur_min: number
    base_eur_target: number
    base_eur_stretch_ai: number
  }
  company_tiers: {
    tier1_boost: string[]
    tier2: string[]
  }
  notes: string
}

export interface ProfileSettings {
  profile: CandidateProfile
  threshold: number
}

export async function fetchSettingsSources(): Promise<SettingsSource[]> {
  const { data } = await http.get<SettingsSource[]>('/settings/sources')
  return data
}

export async function updateSettingsSource(name: string, enabled: boolean): Promise<SettingsSource> {
  const { data } = await http.patch<SettingsSource>(`/settings/sources/${name}`, { enabled })
  return data
}

export async function fetchChannels(): Promise<TelegramChannel[]> {
  const { data } = await http.get<TelegramChannel[]>('/settings/channels')
  return data
}

export async function addChannel(handle: string): Promise<TelegramChannel> {
  const { data } = await http.post<TelegramChannel>('/settings/channels', { handle })
  return data
}

export async function removeChannel(handle: string): Promise<{ handle: string; removed: boolean }> {
  const { data } = await http.delete<{ handle: string; removed: boolean }>(`/settings/channels/${handle}`)
  return data
}

export async function fetchProfile(): Promise<ProfileSettings> {
  const { data } = await http.get<ProfileSettings>('/settings/profile')
  return data
}

export async function saveProfile(profile: CandidateProfile): Promise<CandidateProfile> {
  const { data } = await http.put<CandidateProfile>('/settings/profile', profile)
  return data
}
