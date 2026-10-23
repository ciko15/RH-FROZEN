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
          <div class="password-wrapper">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Masukkan password"
              required
              autocomplete="current-password"
            />
            <button
              type="button"
              class="btn-toggle-eye"
              :title="showPassword ? 'Sembunyikan password' : 'Lihat password'"
              @click="showPassword = !showPassword"
              tabindex="-1"
            >
              <!-- Icon Mata Terbuka -->
              <svg v-if="!showPassword" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <!-- Icon Mata Tertutup / Silang -->
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
          </div>
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
const showPassword = ref(false);
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
.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.password-wrapper input {
  width: 100%;
  padding-right: 42px; /* Ruang untuk tombol mata */
  box-sizing: border-box;
}
.btn-toggle-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  padding: 4px;
  margin: 0;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.2s, background-color 0.2s;
}
.btn-toggle-eye:hover {
  color: var(--primary);
  background-color: rgba(0, 0, 0, 0.05);
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
