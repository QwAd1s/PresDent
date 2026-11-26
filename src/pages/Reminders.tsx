import { useEffect, useMemo, useState } from 'react'
import type { Reminder, ReminderStatus } from '../../shared/types'
import { getReminders, runReminders, skipReminder, type RemindersPayload } from '../lib/api'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, EmptyState, SkeletonRows } from '../components/ui'

const STATUS_LABEL: Record<ReminderStatus, string> = {
  pending: 'Ожидает',
  sent: 'Отправлено',
  dry_run: 'Демо-отправка',
  failed: 'Ошибка',
  skipped: 'Пропущено',
}

const STATUS_STYLE: Record<ReminderStatus, { bg: string; color: string }> = {
  pending: { bg: '#EAF1FE', color: '#2456B8' },
  sent: { bg: '#E6F7F1', color: '#0A7D61' },
  dry_run: { bg: '#FDF4E3', color: '#8A5A06' },
  failed: { bg: '#FDECEC', color: '#B8373C' },
  skipped: { bg: '#EEF2F4', color: '#4A616C' },
}

const KIND_LABEL: Record<Reminder['kind'], string> = {
  appointment: 'Напоминание о приёме',
  review: 'Запрос отзыва',
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'dry_run', label: 'Демо' },
  { value: 'sent', label: 'Отправлены' },
  { value: 'failed', label: 'Ошибки' },
]

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Reminders() {
  const [payload, setPayload] = useState<RemindersPayload | null>(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = (status = filter) => {
    setLoading(true)
    void getReminders(status).then((data) => {
      setPayload(data)
      setLoading(false)
    })
  }

  useEffect(() => {
    load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const run = async () => {
    if (busy) return
    setBusy(true)
    const result = await runReminders()
    setBusy(false)

    if (!result.ok) {
      setToast(result.error ?? 'Не удалось запустить рассылку')
      return
    }

    setToast(
      `Создано ${result.planned?.created ?? 0}, отправлено ${result.sent ?? 0}, ` +
        `демо ${result.dryRun ?? 0}, ошибок ${result.failed ?? 0}`,
    )
    load(filter)
  }

  const stats = payload?.stats
  const items = payload?.items ?? []

  const cards = useMemo(
    () => [
      { label: 'Ожидают отправки', value: stats?.pending ?? 0, tone: '#2456B8', soft: '#EAF1FE', icon: 'clock' as const },
      { label: 'Пора отправить', value: stats?.dueNow ?? 0, tone: '#8A5A06', soft: '#FDF4E3', icon: 'bolt' as const },
      { label: 'Отправлено', value: stats?.sent ?? 0, tone: '#0A7D61', soft: '#E6F7F1', icon: 'checkCheck' as const },
      { label: 'Ошибки', value: stats?.failed ?? 0, tone: '#B8373C', soft: '#FDECEC', icon: 'alert' as const },
    ],
    [stats],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Напоминания</h1>
          <div className="page-sub">
            Пациент получает сообщение за сутки до приёма и просьбу оценить визит после — автоматически
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => load(filter)}>
            <Icon name="refresh" size={15} />
            Обновить
          </button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>
            <Icon name="send" size={15} />
            {busy ? 'Отправляем…' : 'Разослать сейчас'}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="hint-box"
          style={{ marginBottom: 14, background: 'var(--brand-soft)', borderColor: '#cdeee2', color: '#0a5c45' }}
        >
          <Icon name="check" size={16} />
          <div>{toast}</div>
        </div>
      )}

      <div className="kpi-grid">
        {cards.map((card) => (
          <div className="kpi" key={card.label}>
            <div className="kpi-top">
              <span className="kpi-icon" style={{ background: card.soft, color: card.tone }}>
                <Icon name={card.icon} size={17} />
              </span>
              <span className="kpi-label">{card.label}</span>
            </div>
            <div className="kpi-value">{card.value}</div>
            <div className="kpi-foot">в очереди рассылки</div>
          </div>
        ))}
      </div>

      <div className="hint-box" style={{ marginBottom: 16 }}>
        <Icon name="bell" size={16} />
        <div>
          Канал выбирается автоматически: WhatsApp, если подключён, иначе Telegram или SMS. Пока провайдер не
          настроен, сообщения помечаются как «Демо-отправка» — текст готов, но пациенту ничего не уходит.
          Настройки интервалов — в «Настройках», блок «Уведомления».
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="tabs">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                className={`tab ${filter === item.value ? 'active' : ''}`}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
            Всего: {stats?.total ?? 0}
          </span>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Отправка</th>
                  <th style={{ width: 200 }}>Пациент</th>
                  <th style={{ width: 180 }}>Тип</th>
                  <th>Текст</th>
                  <th style={{ width: 130 }}>Статус</th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((reminder) => (
                  <tr key={reminder.id} style={{ cursor: 'default' }}>
                    <td className="nowrap muted" title={formatWhen(reminder.sendAt)}>
                      {relativeTime(reminder.sendAt)}
                    </td>
                    <td>
                      <div className="cell-name">
                        <Avatar name={reminder.patientName} size={28} />
                        <div>
                          <div className="title" style={{ fontSize: 12.5 }}>
                            {reminder.patientName}
                          </div>
                          <div className="sub">{reminder.phone || 'нет телефона'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {KIND_LABEL[reminder.kind]}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {reminder.channel}
                      </div>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink-2)',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                        title={reminder.text}
                      >
                        {reminder.text}
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={STATUS_STYLE[reminder.status]}>
                        {STATUS_LABEL[reminder.status]}
                      </span>
                      {reminder.error && (
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }} title={reminder.error}>
                          {reminder.error.slice(0, 40)}
                        </div>
                      )}
                    </td>
                    <td className="t-right">
                      {reminder.status === 'pending' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={async () => {
                            await skipReminder(reminder.id)
                            load(filter)
                          }}
                        >
                          Пропустить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Пока нечего отправлять"
            text="Напоминания появятся автоматически, когда в расписании будут приёмы на ближайшие дни. Нажмите «Разослать сейчас», чтобы спланировать очередь."
            icon="bell"
          />
        )}
      </section>
    </>
  )
}
