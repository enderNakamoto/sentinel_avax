'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cn } from '@/lib/utils'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/routes', label: 'Buy Insurance' },
  { href: '/policies', label: 'My Policies' },
  { href: '/vault', label: 'Vault' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{ background: '#080a0f', borderColor: '#1e2530' }}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3 gap-4">
        <div className="flex items-center gap-6 flex-wrap">
          <Link href="/" className="font-bold shrink-0" style={{ color: '#e8ecf4', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#3b8ef3' }}>⬡</span> Sentinel
          </Link>
          <div className="flex gap-1 flex-wrap">
            {links.map(({ href, label }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  )}
                  style={{
                    color: isActive ? '#3b8ef3' : '#5a6478',
                    background: isActive ? 'rgba(59,142,243,0.1)' : 'transparent',
                  }}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
        <ConnectButton />
      </div>
    </nav>
  )
}
