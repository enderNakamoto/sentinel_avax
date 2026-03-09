'use client'

export function FlightBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="plane-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Path 1 — long arc, bottom-left to mid-right */}
        <path
          d="M -20,720 C 280,320 750,120 1460,380"
          stroke="#3b8ef3"
          strokeWidth="0.8"
          fill="none"
          opacity="0.12"
          strokeDasharray="8 12"
        />
        <g filter="url(#plane-glow)" opacity="0.55">
          <polygon points="0,-6 5,4 0,1 -5,4" fill="#3b8ef3">
            <animateMotion
              dur="28s"
              repeatCount="indefinite"
              rotate="auto"
              path="M -20,720 C 280,320 750,120 1460,380"
            />
          </polygon>
        </g>

        {/* Path 2 — sweeping arc, top-left to bottom-right */}
        <path
          d="M -20,180 C 350,420 850,650 1460,780"
          stroke="#3b8ef3"
          strokeWidth="0.8"
          fill="none"
          opacity="0.08"
          strokeDasharray="6 14"
        />
        <g filter="url(#plane-glow)" opacity="0.4">
          <polygon points="0,-5 4,3 0,0 -4,3" fill="#2ecc8f">
            <animateMotion
              dur="35s"
              repeatCount="indefinite"
              rotate="auto"
              begin="-12s"
              path="M -20,180 C 350,420 850,650 1460,780"
            />
          </polygon>
        </g>

        {/* Path 3 — gentle mid-screen arc */}
        <path
          d="M -20,480 C 400,200 960,600 1460,280"
          stroke="#3b8ef3"
          strokeWidth="0.8"
          fill="none"
          opacity="0.07"
          strokeDasharray="5 16"
        />
        <g filter="url(#plane-glow)" opacity="0.35">
          <polygon points="0,-5 4,3 0,0 -4,3" fill="#3b8ef3">
            <animateMotion
              dur="42s"
              repeatCount="indefinite"
              rotate="auto"
              begin="-20s"
              path="M -20,480 C 400,200 960,600 1460,280"
            />
          </polygon>
        </g>

        {/* Soft radial glow at center — very subtle */}
        <radialGradient id="center-glow" cx="50%" cy="45%" r="40%">
          <stop offset="0%" stopColor="#3b8ef3" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#3b8ef3" stopOpacity="0" />
        </radialGradient>
        <rect width="1440" height="900" fill="url(#center-glow)" />
      </svg>
    </div>
  )
}
