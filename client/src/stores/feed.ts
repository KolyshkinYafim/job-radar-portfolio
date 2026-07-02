import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchFeed,
  setFeedApplicationStatus,
  type Vacancy,
} from '../api/client'
import type { ListFilters } from './listStore'

export const useFeedStore = defineStore('feed', () => {
  const items = ref<Vacancy[]>([])
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  const selected = ref<Vacancy | null>(null)

  const filters = ref<ListFilters>({
    status: '',
    applicationStatus: '',
    minScore: 0,
    search: '',
    source: '',
  })

  const hasMore = computed(() => items.value.length < total.value)

  let requestId = 0

  async function load(reset = false) {
    if (reset) {
      page.value = 1
      items.value = []
    }
    loading.value = true
    const thisRequest = ++requestId
    try {
      const params: Record<string, unknown> = { page: page.value, limit: 50 }
      if (filters.value.status) params.status = filters.value.status
      if (filters.value.applicationStatus) params.applicationStatus = filters.value.applicationStatus
      if (filters.value.minScore > 0) params.minScore = filters.value.minScore
      if (filters.value.search) params.search = filters.value.search
      if (filters.value.source) params.source = filters.value.source

      const result = await fetchFeed(params)
      if (thisRequest !== requestId) return
      if (reset) {
        items.value = result.items
      } else {
        items.value.push(...result.items)
      }
      total.value = result.total
    } finally {
      if (thisRequest === requestId) loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    page.value++
    await load()
  }

  async function markApplied(id: string, _note?: string) {
    const updated = await setFeedApplicationStatus(id, 'applied')
    patch(id, updated)
  }

  async function updateStatus(id: string, status: string) {
    const updated = await setFeedApplicationStatus(id, status)
    patch(id, updated)
  }

  function patch(id: string, updated: Vacancy) {
    const idx = items.value.findIndex((v) => v.id === id)
    if (idx >= 0) items.value[idx] = updated
    if (selected.value?.id === id) selected.value = updated
  }

  function select(v: Vacancy | null) {
    selected.value = v
  }

  function reset() {
    items.value = []
    total.value = 0
    page.value = 1
    selected.value = null
  }

  return {
    items,
    total,
    page,
    loading,
    selected,
    filters,
    hasMore,
    load,
    loadMore,
    markApplied,
    updateStatus,
    select,
    reset,
  }
})
