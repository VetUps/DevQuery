import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'

import { queryClient } from '@/app/query-client'
import { canAccessAdminWorkspace } from '@/features/admin/libs/admin-access'
import { loadStoredTokens } from '@/features/auth/libs/token-storage'
import {
  CURRENT_USER_QUERY_KEY,
  fetchCurrentUserProfileWithSession,
} from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import AdminPage from '@/pages/AdminPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import AskQuestionPage from '@/pages/AskQuestionPage.vue'
import HomePage from '@/pages/HomePage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'

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
  {
    path: '/admin',
    name: 'admin',
    component: AdminPage,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
    },
  },
]

function hydrateStoredSessionIfNeeded() {
  const sessionStore = useSessionStore()

  if (!sessionStore.accessToken && !sessionStore.refreshToken) {
    sessionStore.hydrateFromStorage()
  }

  return sessionStore
}

async function ensureAuthenticatedSession() {
  const sessionStore = hydrateStoredSessionIfNeeded()

  if (sessionStore.accessToken && sessionStore.isAuthenticated) {
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
}

async function ensureAdminSession() {
  const sessionStore = useSessionStore()

  try {
    const profile = await queryClient.ensureQueryData({
      queryKey: CURRENT_USER_QUERY_KEY,
      queryFn: () => fetchCurrentUserProfileWithSession(sessionStore),
      retry: false,
    })

    if (canAccessAdminWorkspace(profile)) {
      return true
    }
  } catch {
    // Deliberately fall through to a safe denial route without exposing backend details.
  }

  return {
    path: '/profile',
    query: { message: 'admin-required' },
  }
}

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes,
  })

  router.beforeEach(async (to) => {
    hydrateStoredSessionIfNeeded()

    if (!to.meta.requiresAuth) {
      return true
    }

    const authResult = await ensureAuthenticatedSession()

    if (authResult !== true) {
      return authResult
    }

    if (to.meta.requiresAdmin) {
      return ensureAdminSession()
    }

    return true
  })

  return router
}

export const router = createAppRouter(
  typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
)
