import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lead, LeadStatus } from '../../shared/types'
import { CHANNEL_LABEL, SERVICE_LIST, STATUS_LABEL } from '../../shared/types'
import { updateLead, sendMessage } from '../lib/api'
import { formatDate, formatTime, relativeTime } from '../lib/format'
import { Icon } from './Icon'
import { Avatar, ChannelTag, StatusBadge } from './ui'

const QUICK_REPLIES = [
  'Здравствуйте! Спасибо за обращение, подскажите удобную дату и время — подберём запись.',
  'Консультация стоит 1 500 ₽, она входит в стоимость лечения.',
  'Можем записать вас завтра в 18:00, это время свободно.',
]

const dayLabel = (iso: string) => {
  const date = new Date(iso)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Сегодня'
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return formatDate(iso)
}

interface LeadDrawerProps {
  lead: Lead
  onClose: () => void
  onChanged: (lead: Lead) => void
}

export function LeadDrawer({ lead, onClose, onChanged }: LeadDrawerProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(lead.note ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [lead.messages.length, lead.id])

  const grouped = useMemo(() => {
    const groups: { label: string; items: Lead['messages'] }[] = []
    for (const message of lead.messages) {
      const label = dayLabel(message.at)
      const last = groups.at(-1)
      if (last && last.label === label) last.items.push(message)
      else groups.push({ label, items: [message] })
    }
    return groups
  }, [lead.messages])

  const changeStatus = async (status: LeadStatus) => {
    onChanged({ ...lead, status })
    const updated = await updateLead(lead.id, { status })
    if (updated) onChanged(updated)
  }

  const submit = async () => {
    const value = text.trim()
    if (!value || busy) return

    setBusy(true)
    setText('')

    const optimistic: Lead = {
      ...lead,
      status: lead.status === 'new' ? 'in_progress' : lead.status,
      updatedAt: new Date().toISOString(),
      messages: [
        ...lead.messages,
        {
          id: `tmp-${Date.now()}`,
          direction: 'out',
          text: value,
          at: new Date().toISOString(),
          author: 'Администратор',
          delivery: 'queued',
        },
      ],
    }
    onChanged(optimistic)

    const result = await sendMessage(lead.id, value)
    if (result) onChanged(result.lead)
    setBusy(false)
  }

  const saveNote = async () => {
    if (note === (lead.note ?? '')) return
    const updated = await updateLead(lead.id, { note })
    if (updated) onChanged(updated)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Заявка ${lead.name}`}>
        <header className="drawer-head">
          <Avatar name={lead.name} size={44} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 650 }}>{lead.name}</span>
              <StatusBadge status={lead.status} />
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              {lead.phone ?? lead.handle} · {relativeTime(lead.createdAt)}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="drawer-scroll" ref={scrollRef}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <ChannelTag channel={lead.channel} />
            <span className="pill">
              <Icon name="inbox" size={13} />
              {lead.service ?? 'Без услуги'}
            </span>
            {lead.priority === 'high' && (
              <span className="pill" style={{ color: '#b8373c', background: 'var(--danger-soft)', borderColor: '#f6d3d4' }}>
                <Icon name="alert" size={13} />
                Срочно
              </span>
            )}
          </div>

          <div className="card" style={{ padding: '4px 14px', marginBottom: 16 }}>
            <div className="kv" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="k">Статус</span>
              <select
                className="select"
                style={{ height: 30, padding: '0 8px', marginLeft: 'auto' }}
                value={lead.status}
                onChange={(event) => void changeStatus(event.target.value as LeadStatus)}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="kv" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="k">Услуга</span>
              <select
                className="select"
                style={{ height: 30, padding: '0 8px', marginLeft: 'auto' }}
                value={lead.service ?? 'Консультация'}
                onChange={async (event) => {
                  const updated = await updateLead(lead.id, { service: event.target.value })
                  if (updated) onChanged(updated)
                }}
              >
                {(lead.service && !SERVICE_LIST.includes(lead.service)
                  ? [lead.service, ...SERVICE_LIST]
                  : SERVICE_LIST
                ).map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>
            <div className="kv" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="k">Канал</span>
              <span className="v" style={{ marginLeft: 'auto' }}>
                {CHANNEL_LABEL[lead.channel]}
              </span>
            </div>
            <div className="kv">
              <span className="k">Создана</span>
              <span className="v" style={{ marginLeft: 'auto' }}>
                {formatDate(lead.createdAt)}, {formatTime(lead.createdAt)}
              </span>
            </div>
          </div>

          <div className="section-label">История диалога</div>

          {grouped.map((group) => (
            <div key={group.label}>
              <div className="chat-day">{group.label}</div>
              {group.items.map((message) => (
                <div className={`bubble-row ${message.direction}`} key={message.id}>
                  <div className={`bubble ${message.direction}`}>
                    {message.text}
                    <div className="meta">
                      {formatTime(message.at)}
                      {message.direction === 'out' && (
                        <Icon
                          name={message.delivery === 'read' ? 'checkCheck' : 'check'}
                          size={13}
                          style={{ color: message.delivery === 'read' ? '#0E9E7B' : '#9db0b8' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="section-label">Заметка для коллег</div>
          <textarea
            className="input"
            placeholder="Например: аллергия на лидокаин, просила перезвонить после 18:00"
            value={note}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => void saveNote()}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-soft btn-sm" onClick={() => void changeStatus('booked')}>
              <Icon name="calendar" size={14} />
              Записать
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void changeStatus('closed')}>
              <Icon name="check" size={14} />
              Закрыть обращение
            </button>
          </div>
        </div>

        <footer className="drawer-foot">
          <div className="composer">
            <div className="quick-replies">
              {QUICK_REPLIES.map((reply) => (
                <button key={reply} className="quick-reply" onClick={() => setText(reply)} type="button">
                  {reply.length > 42 ? `${reply.slice(0, 42)}…` : reply}
                </button>
              ))}
            </div>
            <textarea
              className="input"
              placeholder={`Ответ в ${CHANNEL_LABEL[lead.channel]}…`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit()
              }}
            />
            <div className="composer-row">
              <span className="hint">Ctrl + Enter — отправить</span>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => void submit()}
                disabled={!text.trim() || busy}
              >
                <Icon name="send" size={14} />
                Отправить
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </>
  )
}
