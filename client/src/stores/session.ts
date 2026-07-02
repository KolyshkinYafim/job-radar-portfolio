import { defineStore } from 'pinia'
import { ref } from 'vue'
import { requestLink, verifyLink, fetchMe, logout as apiLogout, type Me } from '../api/client'

export const useSessionStore = defineStore('session', () => {
  const me = ref<Me | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const error = ref('')
  const linkSent = ref(false)

  async function init() {
    try {
      me.value = await fetchMe()
    } catch {
      me.value = null
    } finally {
      ready.value = true
    }
  }

  async function login(email: string) {
    error.value = ''
    linkSent.value = false
    loading.value = true
    try {
      const { link } = await requestLink(email)
      if (link) {
        await verifyLink(link)
        me.value = await fetchMe()
      } else {
        linkSent.value = true
      }
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { message?: string } } }).response
      error.value = resp?.data?.message ?? 'Sign-in failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiLogout()
    me.value = null
  }

  return { me, ready, loading, error, linkSent, init, login, logout }
})
