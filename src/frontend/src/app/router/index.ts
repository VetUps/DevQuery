import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'

import LoginPage from '@/pages/LoginPage.vue'
import AskQuestionPage from '@/pages/AskQuestionPage.vue'
import HomePage from '@/pages/HomePage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'
import { loadStoredTokens } from '@/features/auth/lib/token-storage'
import { useSessionStore } from '@/features/auth/stores/session'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
  },
  {
    path: '/questions/:questionId',
    name: 'question-detail',
    component: QuestionDetailPage,
  },
  {
    path: '/questions/ask',
    name: 'ask-question',
    component: AskQuestionPage,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: {
      requiresAuth: true,
    },
  },
]

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes,
  })

  router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) {
      return true
    }

    const sessionStore = useSessionStore()

    if (sessionStore.isAuthenticated) {
      return true
    }

    const storedTokens = loadStoredTokens()
    const hadStoredSession = Boolean(
      storedTokens.accessToken ||
        storedTokens.refreshToken ||
        sessionStore.accessToken ||
        sessionStore.refreshToken,
    )

    const restored = await sessionStore.tryRestore()

    if (restored) {
      return true
    }

    if (hadStoredSession) {
      return {
        path: '/login',
        query: { message: 'session-expired' },
      }
    }

    return '/login'
  })

  return router
}

export const router = createAppRouter(
  typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
)
