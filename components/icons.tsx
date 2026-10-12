/**
 * Line icons for the beach screen. Decorative: every one sits beside a text
 * label, so they are hidden from assistive tech.
 */

type IconProps = { className?: string }

function Svg({ className = 'h-5 w-5', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const WavesIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8c2 0 2-1.5 4.5-1.5S9.5 8 12 8s2-1.5 4.5-1.5S19 8 21 8" />
    <path d="M3 13c2 0 2-1.5 4.5-1.5S9.5 13 12 13s2-1.5 4.5-1.5S19 13 21 13" />
    <path d="M3 18c2 0 2-1.5 4.5-1.5S9.5 18 12 18s2-1.5 4.5-1.5S19 18 21 18" />
  </Svg>
)

export const WindIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8h11a2.6 2.6 0 1 0-2.6-2.6" />
    <path d="M3 13h15a2.6 2.6 0 1 1-2.6 2.6" />
    <path d="M3 18h7" />
  </Svg>
)

export const TideIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4v11" />
    <path d="m8 11 4 4 4-4" />
    <path d="M5 20h14" />
  </Svg>
)

export const ThermometerIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 13.6V5.2a2 2 0 1 1 4 0v8.4a4.2 4.2 0 1 1-4 0Z" />
    <path d="M12 17.4h.01" />
  </Svg>
)

export const AlertIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.5 21.5 19.5H2.5L12 3.5Z" />
    <path d="M12 9.5v4.2" />
    <path d="M12 16.7h.01" />
  </Svg>
)

export const CheckCircleIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.3 2.7 2.7L16.2 9.5" />
  </Svg>
)

export const BanIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.7 5.7l12.6 12.6" />
  </Svg>
)

export const QuestionIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" />
    <path d="M12 17.2h.01" />
  </Svg>
)

export const ShareIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 15V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M5 20h14" />
  </Svg>
)

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Svg>
)
