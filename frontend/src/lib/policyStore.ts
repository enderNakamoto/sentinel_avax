const KEY = (addr: string) => `sentinel:policies:${addr.toLowerCase()}`

export interface StoredPolicy {
  poolAddress: string
  flightId: string
  flightDate: string
  purchasedAt: number
}

export function storePolicyBought(
  walletAddress: string,
  policy: Omit<StoredPolicy, 'purchasedAt'>,
) {
  if (typeof window === 'undefined') return
  const existing = loadPolicies(walletAddress)
  const updated = [
    ...existing.filter((p) => p.poolAddress !== policy.poolAddress),
    { ...policy, purchasedAt: Date.now() },
  ]
  localStorage.setItem(KEY(walletAddress), JSON.stringify(updated))
}

export function loadPolicies(walletAddress: string): StoredPolicy[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY(walletAddress))
    return raw ? (JSON.parse(raw) as StoredPolicy[]) : []
  } catch {
    return []
  }
}
