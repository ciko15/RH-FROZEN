import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';

import Login from './views/Login.vue';
import ChangePassword from './views/ChangePassword.vue';
import Dashboard from './views/Dashboard.vue';
import Orders from './views/Orders.vue';
import OrderNew from './views/OrderNew.vue';
import Sales from './views/Sales.vue';
import Receivables from './views/Receivables.vue';
import Stock from './views/Stock.vue';
import Customers from './views/Customers.vue';
import Branches from './views/Branches.vue';
import Reports from './views/Reports.vue';
import History from './views/History.vue';
import More from './views/More.vue';
import ReturnNew from './views/ReturnNew.vue';
import Purchases from './views/Purchases.vue';
import StockOpname from './views/StockOpname.vue';
import Targets from './views/Targets.vue';
import Users from './views/Users.vue';
import AuditLog from './views/AuditLog.vue';
import Placeholder from './views/Placeholder.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { public: true, hideNav: true }
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: ChangePassword,
    meta: { hideNav: true }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/orders',
    name: 'Orders',
    component: Orders
  },
  {
    path: '/orders/new',
    name: 'OrderNew',
    component: OrderNew,
    meta: { showBack: true }
  },
  {
    path: '/sales',
    name: 'Sales',
    component: Sales
  },
  {
    path: '/returns/new',
    name: 'ReturnNew',
    component: ReturnNew,
    meta: { showBack: true }
  },
  {
    path: '/receivables',
    name: 'Receivables',
    component: Receivables,
    meta: { showBack: true }
  },
  {
    path: '/stock',
    name: 'Stock',
    component: Stock
  },
  {
    path: '/stock/opname',
    name: 'StockOpname',
    component: StockOpname,
    meta: { showBack: true, roles: ['admin', 'manajer'] }
  },
  {
    path: '/purchases',
    name: 'Purchases',
    component: Purchases,
    meta: { showBack: true, roles: ['admin', 'manajer'] }
  },
  {
    path: '/customers',
    name: 'Customers',
    component: Customers,
    meta: { showBack: true }
  },
  {
    path: '/branches',
    name: 'Branches',
    component: Branches,
    meta: { showBack: true }
  },
  {
    path: '/reports',
    name: 'Reports',
    component: Reports,
    meta: { showBack: true }
  },
  {
    path: '/targets',
    name: 'Targets',
    component: Targets,
    meta: { showBack: true }
  },
  {
    path: '/history',
    name: 'History',
    component: History,
    meta: { showBack: true }
  },
  {
    path: '/users',
    name: 'Users',
    component: Users,
    meta: { showBack: true }
  },
  {
    path: '/audit',
    name: 'AuditLog',
    component: AuditLog,
    meta: { showBack: true }
  },
  {
    path: '/more',
    name: 'More',
    component: More
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const isPublic = to.meta.public;

  // Hanya periksa status auth jika route butuh login dan belum pernah dicek
  if (!isPublic && authStore.loading) {
    await authStore.checkAuth();
  }

  const isAuthenticated = authStore.isAuthenticated;
  const mustChange = authStore.user?.must_change_password;

  if (!isAuthenticated && !isPublic) {
    return next('/login');
  }

  if (isAuthenticated && isPublic) {
    return next('/dashboard');
  }

  if (isAuthenticated && to.meta.roles && !to.meta.roles.includes(authStore.user?.role)) {
    return next('/dashboard');
  }

  next();
});

export default router;
