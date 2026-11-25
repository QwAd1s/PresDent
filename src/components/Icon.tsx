import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'inbox'
  | 'users'
  | 'doctor'
  | 'calendar'
  | 'star'
  | 'plug'
  | 'settings'
  | 'search'
  | 'bell'
  | 'plus'
  | 'send'
  | 'check'
  | 'checkCheck'
  | 'clock'
  | 'chevronRight'
  | 'chevronDown'
  | 'x'
  | 'filter'
  | 'phone'
  | 'message'
  | 'globe'
  | 'arrowUp'
  | 'arrowDown'
  | 'more'
  | 'edit'
  | 'logout'
  | 'sparkles'
  | 'copy'
  | 'refresh'
  | 'alert'
  | 'trending'
  | 'user'
  | 'card'
  | 'bolt'

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6H10.2v6H5a1 1 0 0 1-1-1z" />,
  inbox: (
    <>
      <path d="M22 12h-5.4l-1.6 3h-6l-1.6-3H2" />
      <path d="M5.4 5h13.2a2 2 0 0 1 1.9 1.4L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l1.5-5.6A2 2 0 0 1 5.4 5z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 19 7a4 4 0 0 1-3 3.87" />
    </>
  ),
  doctor: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21v-2.2a4 4 0 0 1 2.8-3.8L12 14l4.2 1a4 4 0 0 1 2.8 3.8V21" />
      <path d="M12 14.5v3.2M10.4 16.1h3.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M16 3v4M8 3v4M3 10.5h18" />
    </>
  ),
  star: <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9z" />,
  plug: (
    <>
      <path d="M9 3v4M15 3v4" />
      <path d="M7 7h10v3.5a5 5 0 0 1-10 0z" />
      <path d="M12 15.5V21" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.1 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  send: (
    <>
      <path d="M21.5 2.5 10.8 13.2" />
      <path d="M21.5 2.5 15 21l-4.2-7.8L3 9z" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  checkCheck: <path d="m1.5 12.5 4.5 4.5 9-10M11 16l2.5 1 9-10" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.4 2" />
    </>
  ),
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  x: <path d="M5 5l14 14M19 5 5 19" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  phone: (
    <path d="M21 16.9v2.6a1.7 1.7 0 0 1-1.9 1.7 17 17 0 0 1-7.4-2.6 16.7 16.7 0 0 1-5.1-5.1A17 17 0 0 1 4 6.1 1.7 1.7 0 0 1 5.7 4.2H8.3a1.7 1.7 0 0 1 1.7 1.4c.1.9.3 1.7.6 2.5a1.7 1.7 0 0 1-.4 1.8L9 11.1a13.5 13.5 0 0 0 5 5l1.2-1.2a1.7 1.7 0 0 1 1.8-.4c.8.3 1.6.5 2.5.6a1.7 1.7 0 0 1 1.5 1.8z" />
  ),
  message: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4.3-1.1L3 20l1.3-4.3A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </>
  ),
  arrowUp: <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  arrowDown: <path d="M12 5v14m0 0 6-6m-6 6-6-6" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.3" />
    </>
  ),
  trending: <path d="m3 17 6-6 4 4 8-8m0 0h-6m6 0v6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
