import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Channel, Lead, LeadsResponse, LeadStatus } from '../../shared/types'
import { CHANNEL_LABEL, STATUS_LABEL } from '../../shared/types'
import { bulkLeads, createLead, getLeads, getServices, subscribe } from '../lib/api'
import { formatPrice } from '../../shared/services'
import type { Service } from '../../shared/services'
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
  const archived = params.get('archived') === '1'

  const [search, setSearch] = useState(query)
  const [data, setData] = useState<LeadsResponse>({ items: [], counts: EMPTY_COUNTS })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(params.get('new') === '1')
  const [range, setRange] = useState('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)

  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === 'all') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const reload = useCallback(() => {
    setLoading(true)
    setSelectedIds([])
    return getLeads({ status, channel, q: query, archived }).then((payload) => {
      setData(payload)
      setLoading(false)
    })
  }, [status, channel, query, archived])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const unsubscribe = subscribe((type) => {
      if (!type.startsWith('lead')) return
      void getLeads({ status, channel, q: query, archived }).then(setData)
    })
    return () => {
      unsubscribe()
    }
  }, [status, channel, query, archived])

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

  const visibleItems = useMemo(() => {
    const days = range === 'today' ? 1 : range === '7' ? 7 : range === '30' ? 30 : 0
    if (!days) return data.items
    const from = Date.now() - days * 86_400_000
    return data.items.filter((lead) => new Date(lead.createdAt).getTime() >= from)
  }, [data.items, range])

  const totalHint = useMemo(() => {
    if (!visibleItems.length) return 'Ничего не найдено'
    const base = `${visibleItems.length} ${visibleItems.length === 1 ? 'обращение' : 'обращений'}`
    return range === 'all' ? base : `${base} за выбранный период`
  }, [visibleItems.length, range])

  const allSelected = visibleItems.length > 0 && visibleItems.every((lead) => selectedIds.includes(lead.id))

  const toggleSelect = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  const toggleAll = () => setSelectedIds(allSelected ? [] : visibleItems.map((lead) => lead.id))

  const runBulk = async (action: 'archive' | 'restore' | 'delete' | 'status', nextStatus?: LeadStatus) => {
    if (bulkBusy || !selectedIds.length) return
    setBulkBusy(true)
    setBulkMessage(null)
    const result = await bulkLeads(selectedIds, action, nextStatus)
    setBulkBusy(false)
    setConfirmDelete(false)

    if (!result.ok) {
      setBulkMessage(result.error ?? 'Не удалось выполнить действие')
      return
    }

    setBulkMessage(`Готово: ${result.affected ?? selectedIds.length}`)
    await reload()
  }

  const exportCsv = () => {
    const header = ['Дата', 'Клиент', 'Телефон', 'Канал', 'Услуга', 'Статус', 'Последнее сообщение']
    const rows = visibleItems.map((lead) => [
      new Date(lead.createdAt).toLocaleString('ru-RU'),
      lead.name,
      lead.phone ?? lead.handle ?? '',
      CHANNEL_LABEL[lead.channel],
      lead.service ?? '',
      STATUS_LABEL[lead.status],
      lead.messages.at(-1)?.text ?? '',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
      .join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `president-leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

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
            className={`btn ${archived ? 'btn-soft' : 'btn-ghost'}`}
            onClick={() => patchParams({ archived: archived ? null : '1', status: null })}
          >
            <Icon name={archived ? 'inbox' : 'filter'} size={15} />
            {archived ? 'К активным' : 'Архив'}
          </button>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!visibleItems.length}>
            <Icon name="card" size={15} />
            Экспорт CSV
          </button>
          <button className="btn btn-ghost" onClick={() => void reload()}>
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
            <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="all">Все время</option>
              <option value="today">Сегодня</option>
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
            </select>

            <div className="search" style={{ width: 210, margin: 0 }}>
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

        {selectedIds.length > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">
              Выбрано: {selectedIds.length}
            </span>

            {archived ? (
              <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => void runBulk('restore')}>
                <Icon name="refresh" size={14} />
                Вернуть из архива
              </button>
            ) : (
              <>
                <button className="btn btn-soft btn-sm" disabled={bulkBusy} onClick={() => void runBulk('archive')}>
                  <Icon name="inbox" size={14} />
                  В архив
                </button>
                <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => void runBulk('status', 'in_progress')}>
                  <Icon name="clock" size={14} />
                  В работу
                </button>
              </>
            )}

            {confirmDelete ? (
              <>
                <span className="muted" style={{ fontSize: 12 }}>
                  Удалить безвозвратно?
                </span>
                <button className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={() => void runBulk('delete')}>
                  Да, удалить
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </button>
              </>
            ) : (
              <button className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={() => setConfirmDelete(true)}>
                <Icon name="x" size={14} />
                Удалить
              </button>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                setSelectedIds([])
                setConfirmDelete(false)
                setBulkMessage(null)
              }}
            >
              Снять выбор
            </button>
          </div>
        )}

        {bulkMessage && (
          <div className="toolbar" style={{ borderBottom: 'none' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{bulkMessage}</span>
          </div>
        )}

        {loading ? (
          <SkeletonRows rows={6} />
        ) : visibleItems.length ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Выбрать все" /></th>
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
                  {visibleItems.map((lead) => {
                    const last = lead.messages.at(-1)
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelected(lead)}
                        style={lead.archived ? { opacity: 0.62 } : undefined}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            aria-label={`Выбрать ${lead.name}`}
                          />
                        </td>
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
            title={archived ? "Архив пуст" : "Заявок нет"}
            text={
              archived
                ? "Сюда попадают обработанные заявки, которые вы убрали из работы."
                : "Как только клиент напишет в WhatsApp или Instagram, обращение появится здесь автоматически."
            }
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
  const [services, setServices] = useState<Service[]>([])

  useEffect(() => {
    void getServices().then((payload) => setServices(payload.items.filter((item) => item.active !== false)))
  }, [])

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
            {services.map((item) => (
              <option key={item.id} value={item.title}>
                {item.title} — {formatPrice(item.price)}
              </option>
            ))}
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
