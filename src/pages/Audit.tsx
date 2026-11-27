import { useEffect, useMemo, useState } from 'react'
import type { AuditEntity, AuditRecord } from '../../shared/types'
import { getAudit, subscribe } from '../lib/api'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, EmptyState, SkeletonRows } from '../components/ui'

const ENTITY_LABEL: Record<AuditEntity | 'all', string> = {
  all: 'Все',
  lead: 'Заявки',
  appointment: 'Записи',
  review: 'Отзывы',
  auth: 'Вход и пароли',
  user: 'Сотрудники',
  settings: 'Настройки',
  patient: 'Пациенты',
  reminder: 'Напоминания',
  doctor: 'Врачи',
  service: 'Услуги',
}

const ENTITY_COLOR: Record<AuditEntity, { bg: string; color: string }> = {
  lead: { bg: '#EAF1FE', color: '#2456B8' },
  appointment: { bg: '#E6F7F1', color: '#0A7D61' },
  review: { bg: '#FDF4E3', color: '#8A5A06' },
  auth: { bg: '#EEF2F4', color: '#4A616C' },
  user: { bg: '#F1ECFE', color: '#6D3FD1' },
  settings: { bg: '#E7F3F6', color: '#0F7C93' },
  patient: { bg: '#FDECEF', color: '#B8375A' },
  reminder: { bg: '#EAF7F3', color: '#0B6E59' },
  doctor: { bg: '#EAF1FE', color: '#2F6FED' },
  service: { bg: '#F1F7EE', color: '#3F6B1F' },
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Вход в систему',
  'auth.logout': 'Выход',
  'auth.logout_others': 'Завершены сессии',
  'auth.password_change': 'Смена пароля',
  'lead.create': 'Создана заявка',
  'lead.status': 'Статус заявки',
  'lead.update': 'Изменение заявки',
  'lead.message': 'Ответ пациенту',
  'appointment.create': 'Создана запись',
  'appointment.status': 'Статус приёма',
  'appointment.cancel': 'Отмена приёма',
  'appointment.reschedule': 'Перенос приёма',
  'review.reply': 'Ответ на отзыв',
  'settings.update': 'Настройки клиники',
  'user.create': 'Сотрудник добавлен',
  'user.update': 'Изменение доступа',
  'user.password_reset': 'Сброс пароля',
  'reminders.run': 'Запуск напоминаний',
  'reminder.skip': 'Напоминание пропущено',
  'service.create': 'Услуга добавлена',
  'service.update': 'Услуга изменена',
}

const ENTITIES: (AuditEntity | 'all')[] = ['all', 'lead', 'appointment', 'reminder', 'review', 'auth', 'user', 'settings', 'service']

export default function Audit() {
  const [entity, setEntity] = useState<AuditEntity | 'all'>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AuditRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = () => {
    setLoading(true)
    void getAudit({ entity, q: query, limit: 150 }).then((payload) => {
      setItems(payload.items)
      setTotal(payload.total)
      setLoading(false)
    })
  }

  useEffect(load, [entity, query])

  useEffect(() => {
    const unsubscribe = subscribe((type) => {
      if (type === 'audit:new') load()
    })
    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, query])

  const stats = useMemo(() => {
    const today = new Date().toDateString()
    const todayCount = items.filter((item) => new Date(item.at).toDateString() === today).length
    const people = new Set(items.map((item) => item.userName)).size
    return { todayCount, people }
  }, [items])

  const exportCsv = () => {
    const header = 'Время;Сотрудник;Действие;Объект;Детали'
    const rows = items.map((item) =>
      [
        new Date(item.at).toLocaleString('ru-RU'),
        item.userName,
        ACTION_LABEL[item.action] ?? item.action,
        ENTITY_LABEL[item.entity],
        item.details ?? '',
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(';'),
    )

    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `president-audit-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Журнал действий</h1>
          <div className="page-sub">
            {total} записей · сегодня {stats.todayCount} · сотрудников в журнале: {stats.people}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!items.length}>
            <Icon name="card" size={15} />
            Экспорт CSV
          </button>
          <button className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={15} />
            Обновить
          </button>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="tabs">
            {ENTITIES.map((value) => (
              <button
                key={value}
                className={`tab ${entity === value ? 'active' : ''}`}
                onClick={() => setEntity(value)}
              >
                {ENTITY_LABEL[value]}
              </button>
            ))}
          </div>

          <div className="search" style={{ width: 250, margin: 0, marginLeft: 'auto' }}>
            <Icon name="search" size={15} />
            <input placeholder="Сотрудник, действие, детали" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={7} />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Когда</th>
                  <th style={{ width: 210 }}>Сотрудник</th>
                  <th style={{ width: 200 }}>Действие</th>
                  <th>Детали</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((record) => {
                  const tone = ENTITY_COLOR[record.entity] ?? ENTITY_COLOR.auth
                  return (
                    <tr key={record.id} style={{ cursor: 'default' }}>
                      <td className="nowrap muted">{relativeTime(record.at)}</td>
                      <td>
                        <div className="cell-name">
                          <Avatar name={record.userName} size={28} />
                          <div>
                            <div className="title" style={{ fontSize: 12.5 }}>
                              {record.userName}
                            </div>
                            <div className="sub">{ENTITY_LABEL[record.entity]}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ background: tone.bg, color: tone.color }}>
                          {ACTION_LABEL[record.action] ?? record.action}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{record.details ?? '—'}</td>
                      <td className="t-right muted nowrap" style={{ fontSize: 11.5 }}>
                        {new Date(record.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Записей нет"
            text="Действия сотрудников появятся здесь автоматически: смена статусов, ответы пациентам, записи и доступы."
            icon="clock"
          />
        )}
      </section>

      <div className="hint-box" style={{ marginTop: 14 }}>
        <Icon name="alert" size={16} />
        <div>
          Журнал хранит последние 800 событий в базе. Для полноценного аудита (хранение лет, выгрузка по требованию,
          привязка к IP) нужна таблица в PostgreSQL — это следующий шаг после переезда с JSON.
        </div>
      </div>
    </>
  )
}
