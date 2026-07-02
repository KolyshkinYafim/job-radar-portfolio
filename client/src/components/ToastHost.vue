<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { toasts } = useToast()
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        role="status"
      >
        <span class="toast-dot" />
        <span>{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>
