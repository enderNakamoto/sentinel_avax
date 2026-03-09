'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/routes', label: 'Buy Insurance' },
  { href: '/policies', label: 'My Policies' },
  { href: '/vault', label: 'Vault' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3 gap-4">
        <div className="flex items-center gap-6 flex-wrap">
          <Link href="/" className="font-semibold text-foreground shrink-0">
            Sentinel Protocol
          </Link>
          <div className="flex gap-1 flex-wrap">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <ConnectButton />
      </div>
    </nav>
  )
}
