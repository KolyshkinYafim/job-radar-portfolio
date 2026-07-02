<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'
import BaseButton from './BaseButton.vue'

const session = useSessionStore()
const email = ref('')

async function submit() {
  if (!email.value.trim() || session.loading) return
  try {
    await session.login(email.value.trim())
  } catch {
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <h2 class="login-title">Your personal feed</h2>
      <p class="login-sub">Closed beta — sign in with your whitelisted email to see your matches.</p>
      <form class="login-form" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          placeholder="you@email.com"
          class="login-input"
          autocomplete="email"
        />
        <BaseButton type="submit" variant="tinted" :disabled="session.loading || !email.trim()">
          {{ session.loading ? 'Signing in…' : 'Continue' }}
        </BaseButton>
      </form>
      <p v-if="session.error" class="login-err">{{ session.error }}</p>
      <p v-else-if="session.linkSent" class="login-hint">
        Sign-in link issued — email delivery isn't wired up in this demo, so ask the
        owner to grab it from the server logs.
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--b1);
  border: 1px solid var(--bd);
  border-radius: 12px;
  padding: 28px 26px;
}

.login-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--t1);
}

.login-sub {
  margin: 8px 0 20px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--t2);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-input {
  background: var(--b2);
  border: 1px solid var(--bd);
  border-radius: 7px;
  padding: 10px 13px;
  font-size: 14px;
  color: var(--t1);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.login-input::placeholder { color: var(--t3); }
.login-input:focus {
  border-color: rgba(0, 229, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.06);
  outline: none;
}


.login-err {
  margin: 14px 0 0;
  font-size: 12.5px;
  color: var(--red);
}

.login-hint {
  margin: 14px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--t2);
}
</style>
