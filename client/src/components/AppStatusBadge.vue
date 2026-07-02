<script setup lang="ts">
defineProps<{ status: string | null | undefined }>()

const labels: Record<string, string> = {
  applied:   'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer:     'Offer ✦',
  rejected:  'Rejected',
  withdrawn: 'Withdrawn',
}
</script>

<template>
  <span v-if="status" class="status-badge" :class="status">
    {{ labels[status] ?? status }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
  white-space: nowrap;
}
.applied   { background: rgba(0, 229, 255, 0.08);  color: var(--cyan);   border-color: rgba(0, 229, 255, 0.2);  }
.screening { background: rgba(155,115,255, 0.08);  color: #b89fff;       border-color: rgba(155,115,255, 0.2);  }
.interview { background: rgba(255,171, 64, 0.08);  color: var(--amber);  border-color: rgba(255,171, 64, 0.2);  }
.offer     { background: rgba(0, 230, 118, 0.08);  color: var(--green);  border-color: rgba(0, 230, 118, 0.2);  }
.rejected  { background: rgba(255, 83,112, 0.08);  color: var(--red);    border-color: rgba(255, 83,112, 0.2);  }
.withdrawn { background: var(--b2);                color: var(--t3);     border-color: var(--bd);               }
</style>
