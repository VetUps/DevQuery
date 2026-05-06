import { fetchProfile } from '@/features/auth/api/auth'
import type { ReputationLedgerEntry } from '@/features/users/api/reputation'

export async function fetchReputationLedger(accessToken: string): Promise<ReputationLedgerEntry[]> {
  const profile = await fetchProfile(accessToken)

  return profile.reputation_ledger
}
