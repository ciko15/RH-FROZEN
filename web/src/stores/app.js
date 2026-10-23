import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const theme = ref(localStorage.getItem('theme') || 'light');
  const toasts = ref([]);
  const activeSyncs = ref(0);

  function startSync() {
    activeSyncs.value += 1;
  }

  function finishSync() {
    if (activeSyncs.value > 0) {
      activeSyncs.value -= 1;
    }
  }

  function setTheme(newTheme) {
    theme.value = newTheme;
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  function toggleTheme() {
    setTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  function showToast(message, type = 'info') {
    const id = Date.now();
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 2500);
  }

  return {
    theme,
    toasts,
    activeSyncs,
    startSync,
    finishSync,
    setTheme,
    toggleTheme,
    showToast
  };
});
