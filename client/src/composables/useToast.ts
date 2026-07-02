import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

const toasts = ref<Toast[]>([])
let seq = 0

export function useToast() {
  function push(message: string, type: Toast['type'] = 'success', ttl = 3000) {
    const id = ++seq
    toasts.value.push({ id, message, type })
    window.setTimeout(() => dismiss(id), ttl)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, push, dismiss }
}
