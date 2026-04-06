import axios from 'axios'

import { apiBaseUrl } from '@/shared/api/config'

export interface UserProfile {
  user_name: string
  user_email: string
  user_reputation_score: number
  user_avatar_url: string | null
  user_bio: string | null
  user_created_at: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface LoginPayload {
  user_email: string
  password: string
}

export interface RegisterPayload {
  user_name: string
  user_email: string
  password: string
  password_confirm: string
}

export interface LoginResponse extends AuthTokens {
  user: UserProfile
}

export interface LogoutPayload {
  refresh: string
}

const authTransport = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

function createAuthHeaders(accessToken?: string | null) {
  if (!accessToken) {
    return undefined
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

export async function registerUser(payload: RegisterPayload) {
  const response = await authTransport.post<UserProfile>('/user/register/', payload)
  return response.data
}

export async function loginUser(payload: LoginPayload) {
  const response = await authTransport.post<LoginResponse>('/user/login/', payload)
  return response.data
}

export async function logoutUser(payload: LogoutPayload, accessToken: string) {
  await authTransport.post('/user/logout/', payload, {
    headers: createAuthHeaders(accessToken),
  })
}

export async function fetchProfile(accessToken: string) {
  const response = await authTransport.get<UserProfile>('/user/profile/', {
    headers: createAuthHeaders(accessToken),
  })
  return response.data
}

export async function requestTokenRefresh(refresh: string) {
  const response = await authTransport.post<AuthTokens>('/token/refresh/', {
    refresh,
  })
  return response.data
}
