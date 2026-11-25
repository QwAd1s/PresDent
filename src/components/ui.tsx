import type { ReactNode } from 'react'
import type { Channel, LeadStatus } from '../../shared/types'
import { CHANNEL_LABEL, STATUS_LABEL } from '../../shared/types'
import { Icon, type IconName } from './Icon'
import { avatarColor, initials } from '../lib/format'

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>
}

export function WhatsAppGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.1L2 22l5.1-1.6A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.02.95.96-2.94-.2-.3a8.2 8.2 0 1 1 6.76 3.62zm4.5-6.1c-.25-.13-1.46-.72-1.68-.8-.23-.09-.4-.13-.56.12-.17.25-.65.8-.8.96-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.83-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08s.9 2.42 1.02 2.58c.13.17 1.76 2.69 4.27 3.77.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.17-.48-.29z" />
    </svg>
  )
}

export function InstagramGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} aria-hidden="true">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.1" cy="6.9" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChannelIcon({ channel, size = 22 }: { channel: Channel; size?: number }) {
  return (
    <span className={`channel-icon ${channel}`} style={{ width: size, height: size }}>
      {channel === 'whatsapp' && <WhatsAppGlyph size={size * 0.62} />}
      {channel === 'instagram' && <InstagramGlyph size={size * 0.58} />}
      {channel === 'site' && <Icon name="globe" size={size * 0.56} />}
      {channel === 'phone' && <Icon name="phone" size={size * 0.54} />}
    </span>
  )
}

export function ChannelTag({ channel, showLabel = true }: { channel: Channel; showLabel?: boolean }) {
  return (
    <span className="channel-chip">
      <ChannelIcon channel={channel} size={20} />
      {showLabel && CHANNEL_LABEL[channel]}
    </span>
  )
}

export function Avatar({
  name,
  size = 36,
  color,
  radius,
}: {
  name: string
  size?: number
  color?: string
  radius?: number
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: color ?? avatarColor(name),
        borderRadius: radius ?? size / 2,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={index <= Math.round(value) ? 'currentColor' : '#e6ebee'}
          aria-hidden="true"
        >
          <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9z" />
        </svg>
      ))}
    </span>
  )
}

export function EmptyState({
  title,
  text,
  icon = 'inbox',
}: {
  title: string
  text?: string
  icon?: IconName
}) {
  return (
    <div className="empty">
      <span className="icon-wrap">
        <Icon name={icon} size={20} />
      </span>
      <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>
      {text && <div style={{ fontSize: 12.5, maxWidth: 320 }}>{text}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="card-title">{title}</div>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 10, padding: 18 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: 34, opacity: 1 - index * 0.12 }} />
      ))}
    </div>
  )
}
