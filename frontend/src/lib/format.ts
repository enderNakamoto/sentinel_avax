export function formatUsdc(raw: bigint | undefined | null): string {
  if (raw === undefined || raw === null) return '—'
  return (Number(raw) / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function parseUsdc(amount: string): bigint {
  const n = parseFloat(amount)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

export function parseShares(amount: string): bigint {
  const n = parseFloat(amount)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

export function formatSharePrice(totalManaged: bigint, totalShares: bigint): string {
  if (totalShares === 0n) return '1.000000'
  return (Number(totalManaged) / Number(totalShares)).toFixed(6)
}

export function formatAddress(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function getErrMsg(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    // Extract revert reason if present
    const match = msg.match(/reverted with reason string '(.+?)'/)
    if (match) return match[1]
    const customMatch = msg.match(/reverted with custom error '(.+?)'/)
    if (customMatch) return customMatch[1]
    return msg.slice(0, 140)
  }
  return 'Transaction failed'
}
