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

function SentinelLogo() {
  return (
    <Link href="/" className="flex items-center gap-3 shrink-0 group">
      {/* Shield icon */}
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: 'logo-glow 3s ease-in-out infinite' }}
      >
        <path
          d="M18 3L30 9V18C30 24.6 24.6 30.8 18 33C11.4 30.8 6 24.6 6 18V9L18 3Z"
          stroke="#3b8ef3"
          strokeWidth="1.5"
          fill="rgba(59,142,243,0.1)"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 18L16.5 22L23.5 14"
          stroke="#3b8ef3"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <span
          style={{
            color: '#e8ecf4',
            fontSize: '1.05rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            lineHeight: 1,
          }}
        >
          SENTINEL
        </span>
        <span
          style={{
            color: '#5a6478',
            fontSize: '0.58rem',
            letterSpacing: '0.18em',
            lineHeight: 1,
            marginTop: '3px',
          }}
        >
          PROTOCOL
        </span>
      </div>
    </Link>
  )
}

export function Nav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{ background: '#080a0f', borderColor: '#1e2530' }}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3 gap-4">
        <div className="flex items-center gap-8 flex-wrap">
          <SentinelLogo />
          <div className="flex gap-1 flex-wrap">
            {links.map(({ href, label }) => {
              const isActive =
                pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-all')}
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
