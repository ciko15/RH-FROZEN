<template>
  <div class="placeholder-page">
    <div class="card">
      <h2>{{ title }}</h2>
      <p>Modul {{ title }} sedang dalam tahap pengembangan.</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: 'Halaman'
  }
});
</script>

<style scoped>
.placeholder-page {
  padding: 16px;
  padding-bottom: 80px;
}
h2 {
  font-size: 16px;
  color: var(--primary);
  margin-bottom: 8px;
}
p {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
