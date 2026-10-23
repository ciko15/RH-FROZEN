<template>
  <div class="change-pw-page">
    <div class="card">
      <h2>Ganti Password</h2>
      <p class="subtitle">Demi keamanan, Anda wajib mengganti password awal sebelum menggunakan aplikasi.</p>

      <form @submit.prevent="handleChangePassword" class="form">
        <div class="form-group">
          <label>Password Lama</label>
          <input
            v-model="oldPassword"
            type="password"
            placeholder="Masukkan password lama"
            required
          />
        </div>

        <div class="form-group">
          <label>Password Baru</label>
          <input
            v-model="newPassword"
            type="password"
            placeholder="Minimal 8 karakter kombinasi huruf & angka"
            required
          />
        </div>

        <div class="form-group">
          <label>Ulangi Password Baru</label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Ulangi password baru"
            required
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Menyimpan...' : 'Simpan Password Baru' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);

async function handleChangePassword() {
  if (newPassword.value !== confirmPassword.value) {
    appStore.showToast('Konfirmasi password tidak cocok', 'error');
    return;
  }

  loading.value = true;
  try {
    await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        old_password: oldPassword.value,
        new_password: newPassword.value
      })
    });

    appStore.showToast('Password berhasil diganti!', 'success');
    await authStore.checkAuth();
    router.push('/dashboard');
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.change-pw-page {
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 120px);
}
.card {
  width: 100%;
  max-width: 400px;
}
h2 {
  font-size: 18px;
  color: var(--text-main);
  margin-bottom: 6px;
}
.subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 20px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
label {
  font-size: 13px;
  font-weight: 600;
}
.btn-primary {
  background: var(--primary);
  color: white;
  margin-top: 10px;
}
</style>
