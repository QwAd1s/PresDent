import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Channel, Lead, LeadsResponse, LeadStatus } from '../../shared/types'
import { CHANNEL_LABEL, STATUS_LABEL } from '../../shared/types'
import { createLead, getLeads, subscribe } from '../lib/api'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, ChannelIcon, EmptyState, Field, Modal, SkeletonRows, StatusBadge } from '../components/ui'
import { LeadDrawer } from '../components/LeadDrawer'

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'booked', label: 'Записаны' },
  { value: 'closed', label: 'Закрыты' },
  { value: 'spam', label: 'Спам' },
]

const EMPTY_COUNTS: LeadsResponse['counts'] = { new: 0, in_progress: 0, booked: 0, closed: 0, spam: 0, all: 0 }

export default function Leads() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const channel = params.get('channel') ?? 'all'
  const query = params.get('q') ?? ''

  const [search, setSearch] = useState(query)
  const [data, setData] = useState<LeadsResponse>({ items: [], counts: EMPTY_COUNTS })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(params.get('new') === '1')

  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === 'all') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    let alive = true
    setLoading(true)

    getLeads({ status, channel, q: query }).then((payload) => {
      if (!alive) return
      setData(payload)
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [status, channel, query])

  useEffect(() => {
    const unsubscribe = subscribe((type) => {
      if (!type.startsWith('lead')) return
      void getLeads({ status, channel, q: query }).then(setData)
    })
    return () => {
      unsubscribe()
    }
  }, [status, channel, query])

  useEffect(() => {
    // если поиск меняется извне (например, из строки в шапке) — подхватываем
    if (search !== query) setSearch(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (search === query) return
    const timer = setTimeout(() => patchParams({ q: search || null }), 320)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const counts = data.counts
  const totalHint = useMemo(() => {
    if (!data.items.length) return 'Ничего не найдено'
    return `${data.items.length} ${data.items.length === 1 ? 'обращение' : 'обращений'}`
  }, [data.items.length])

  const handleChanged = (updated: Lead) => {
    setSelected(updated)
    setData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === updated.id ? updated : item)),
      counts: current.counts,
    }))
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Заявки</h1>
          <div className="page-sub">
            Обращения из WhatsApp, Instagram, сайта и звонков — в одном окне
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            onClick={() => void getLeads({ status, channel, q: query }).then(setData)}
          >
            <Icon name="refresh" size={15} />
            Обновить
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            Создать заявку
          </button>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                className={`tab ${status === tab.value ? 'active' : ''}`}
                onClick={() => patchParams({ status: tab.value })}
              >
                {tab.label}
                <span className="count">{counts[tab.value as LeadStatus | 'all']}</span>
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="search" style={{ width: 230, margin: 0 }}>
              <Icon name="search" size={15} />
              <input placeholder="Имя, телефон, текст" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>

            <select className="select" value={channel} onChange={(event) => patchParams({ channel: event.target.value })}>
              <option value="all">Все каналы</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="site">Сайт</option>
              <option value="phone">Телефон</option>
            </select>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : data.items.length ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Канал</th>
                    <th>Услуга</th>
                    <th>Последнее сообщение</th>
                    <th>Статус</th>
                    <th>Обновлено</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((lead) => {
                    const last = lead.messages.at(-1)
                    return (
                      <tr key={lead.id} onClick={() => setSelected(lead)}>
                        <td style={{ width: 230 }}>
                          <div className="cell-name">
                            <Avatar name={lead.name} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div className="title">
                                {lead.name}
                                {lead.unread > 0 && (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      color: '#fff',
                                      background: 'var(--brand)',
                                      borderRadius: 20,
                                      padding: '1px 6px',
                                    }}
                                  >
                                    {lead.unread}
                                  </span>
                                )}
                              </div>
                              <div className="sub">{lead.phone ?? lead.handle ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ width: 130 }}>
                          <span className="channel-chip">
                            <ChannelIcon channel={lead.channel} size={20} />
                            {CHANNEL_LABEL[lead.channel]}
                          </span>
                        </td>
                        <td style={{ width: 150 }} className="nowrap">
                          {lead.service ?? '—'}
                        </td>
                        <td style={{ maxWidth: 340 }}>
                          <div
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--ink-2)',
                            }}
                          >
                            {last?.direction === 'out' && <span className="muted">Вы: </span>}
                            {last?.text}
                          </div>
                        </td>
                        <td style={{ width: 110 }}>
                          <StatusBadge status={lead.status} />
                        </td>
                        <td style={{ width: 120 }} className="nowrap muted">
                          {relativeTime(lead.updatedAt)}
                        </td>
                        <td style={{ width: 40 }} className="t-right">
                          <Icon name="chevronRight" size={15} style={{ color: 'var(--ink-3)' }} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink-3)' }}>{totalHint}</div>
          </>
        ) : (
          <EmptyState
            title="Заявок нет"
            text="Как только клиент напишет в WhatsApp или Instagram, обращение появится здесь автоматически."
          />
        )}
      </section>

      {/* Статусы, доступные из карточки, показываем легендой */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
        {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((value) => (
          <span key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusBadge status={value} />
            {value === 'new' && '— ждёт первого ответа'}
            {value === 'in_progress' && '— администратор в диалоге'}
            {value === 'booked' && '— пациент записан'}
            {value === 'closed' && '— обращение закрыто'}
          </span>
        ))}
      </div>

      {selected && (
        <LeadDrawer lead={selected} onClose={() => setSelected(null)} onChanged={handleChanged} />
      )}

      {creating && (
        <CreateLeadModal
          onClose={() => {
            setCreating(false)
            patchParams({ new: null })
          }}
          onCreated={(lead) => {
            setCreating(false)
            patchParams({ new: null })
            setData((current) => ({ ...current, items: [lead, ...current.items] }))
            setSelected(lead)
          }}
        />
      )}
    </>
  )
}

function CreateLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (lead: Lead) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState('Консультация')
  const [channel, setChannel] = useState<Channel>('phone')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const valid = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 10

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const lead = await createLead({ name: name.trim(), phone: phone.trim(), service, channel, text: text.trim() })
    setBusy(false)
    if (lead) onCreated(lead)
  }

  return (
    <Modal
      title="Новая заявка"
      subtitle="Ручная запись обращения — например, после звонка или визита"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={() => void submit()}>
            <Icon name="plus" size={15} />
            Создать
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Имя пациента">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Анна Смирнова" />
        </Field>
        <Field label="Телефон">
          <input
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 900 000-00-00"
          />
        </Field>
        <Field label="Услуга">
          <select className="select" value={service} onChange={(event) => setService(event.target.value)}>
            {['Консультация', 'Гигиена и чистка', 'Лечение кариеса', 'Имплантация', 'Протезирование', 'Ортодонтия', 'Эстетика', 'Удаление зуба', 'Детская стоматология'].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Канал">
          <select className="select" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
            {(['phone', 'whatsapp', 'instagram', 'site'] as Channel[]).map((item) => (
              <option key={item} value={item}>
                {CHANNEL_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Комментарий" hint="Что беспокоит и когда удобно прийти">
        <textarea
          className="input"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Например: болит зуб справа, удобно после 18:00"
        />
      </Field>
    </Modal>
  )
}
