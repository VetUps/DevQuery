import axios from 'axios'

import {
  parseReputationLedger,
  parseReputationSummary,
  type ReputationLedgerEntry,
  type ReputationSummary,
} from '@/features/users/api/reputation'
import { apiBaseUrl } from '@/shared/api/config'

export type UserRole = 'user' | 'admin'

export interface UserProfile {
  user_id: string
  user_name: string
  user_email: string
  user_role: UserRole
  user_reputation_score: number
  user_avatar_url: string | null
  user_avatar_updated_at: string | null
  user_bio: string | null
  user_created_at: string
  reputation: ReputationSummary
  reputation_ledger: ReputationLedgerEntry[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Malformed auth response: ${fieldName}`)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, fieldName)
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Malformed auth response: ${fieldName}`)
  }

  return value
}

function assertUserRole(value: unknown): UserRole {
  if (value !== 'user' && value !== 'admin') {
    throw new Error('Malformed auth response: user_role')
  }

  return value
}

function parseUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) {
    throw new Error('Malformed auth response: expected profile object')
  }

  return {
    user_id: assertString(value.user_id, 'user_id'),
    user_name: assertString(value.user_name, 'user_name'),
    user_email: assertString(value.user_email, 'user_email'),
    user_role: assertUserRole(value.user_role),
    user_reputation_score: assertNumber(value.user_reputation_score, 'user_reputation_score'),
    user_avatar_url: assertNullableString(value.user_avatar_url, 'user_avatar_url'),
    user_avatar_updated_at: assertNullableString(value.user_avatar_updated_at, 'user_avatar_updated_at'),
    user_bio: assertNullableString(value.user_bio, 'user_bio'),
    user_created_at: assertString(value.user_created_at, 'user_created_at'),
    reputation: parseReputationSummary(value.reputation),
    reputation_ledger: parseReputationLedger(value.reputation_ledger),
  }
}

function parseLoginResponse(value: unknown): LoginResponse {
  if (!isRecord(value)) {
    throw new Error('Malformed auth response: expected login object')
  }

  return {
    access: assertString(value.access, 'access'),
    refresh: assertString(value.refresh, 'refresh'),
    user: parseUserProfile(value.user),
  }
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
  const response = await authTransport.post<unknown>('/user/register/', payload)
  return parseUserProfile(response.data)
}

export async function loginUser(payload: LoginPayload) {
  const response = await authTransport.post<unknown>('/user/login/', payload)
  return parseLoginResponse(response.data)
}

export async function logoutUser(payload: LogoutPayload, accessToken: string) {
  await authTransport.post('/user/logout/', payload, {
    headers: createAuthHeaders(accessToken),
  })
}

export async function fetchProfile(accessToken: string) {
  const response = await authTransport.get<unknown>('/user/profile/', {
    headers: createAuthHeaders(accessToken),
  })
  return parseUserProfile(response.data)
}

export async function uploadAvatar(file: File, accessToken: string) {
  const formData = new FormData()
  formData.append('user_avatar_url', file)

  const response = await authTransport.patch<unknown>('/user/profile/avatar/', formData, {
    headers: {
      ...createAuthHeaders(accessToken),
      'Content-Type': 'multipart/form-data',
    },
  })
  return parseUserProfile(response.data)
}

export async function requestTokenRefresh(refresh: string) {
  const response = await authTransport.post<AuthTokens>('/token/refresh/', {
    refresh,
  })
  return response.data
}
