import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../api.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const isAuthenticated = ref(false);
  const loading = ref(true);

  async function checkAuth() {
    loading.value = true;
    try {
      const res = await apiFetch('/api/auth/me');
      user.value = res.data;
      isAuthenticated.value = true;
    } catch (err) {
      user.value = null;
      isAuthenticated.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function login(username, password) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    user.value = res.data;
    isAuthenticated.value = true;
    return res.data;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    } finally {
      user.value = null;
      isAuthenticated.value = false;
      loading.value = false;
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    checkAuth,
    login,
    logout
  };
});
