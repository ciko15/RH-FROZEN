<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo-area">
        <img src="/logo.png" alt="Logo RH Frozen" class="login-logo" />
        <h1>Sales Terpadu</h1>
        <p>Aplikasi Penjualan & Distribusi RH Frozen</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            placeholder="Masukkan username"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Masukkan password"
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Memproses...' : 'Masuk' }}
        </button>
      </form>

      <div class="login-footer">
        RH Frozen Food • Bersama Maju Lebih Baik
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

const username = ref('');
const password = ref('');
const loading = ref(false);

async function handleLogin() {
  if (loading.value) return;
  loading.value = true;
  try {
    const user = await authStore.login(username.value, password.value);
    appStore.showToast(`Selamat datang, ${user.full_name}!`, 'success');

    if (user.must_change_password) {
      router.push('/change-password');
    } else {
      router.push('/dashboard');
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background-color: var(--bg-app);
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-card);
  padding: 32px 24px;
  border-radius: var(--radius-card);
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
  border: 1px solid var(--border-color);
}
.logo-area {
  text-align: center;
  margin-bottom: 24px;
}
.login-logo {
  width: 68px;
  height: 68px;
  border-radius: 12px;
  margin-bottom: 12px;
}
h1 {
  font-size: 20px;
  color: var(--primary);
  margin-bottom: 4px;
}
p {
  font-size: 13px;
  color: var(--text-muted);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.btn-primary {
  background: var(--primary);
  color: white;
  width: 100%;
  margin-top: 8px;
}
.login-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 11px;
  color: var(--text-light);
}
</style>
