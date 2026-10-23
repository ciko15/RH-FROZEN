import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import './styles.css';

import Icon from './components/Icon.vue';

const app = createApp(App);
const pinia = createPinia();

app.component('Icon', Icon);

app.use(pinia);
app.use(router);

app.mount('#app');
