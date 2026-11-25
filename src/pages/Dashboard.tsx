import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Doctor, Lead, Stats } from '../../shared/types'
import { CHANNEL_LABEL } from '../../shared/types'
import { getDoctors, getLeads, getStats, subscribe, connectRealtime } from '../lib/api'
import { initials, relativeTime } from '../lib/format'
import { Icon, type IconName } from '../components/Icon'
import { ChannelIcon, ChannelTag, SkeletonRows, Stars, StatusBadge, Avatar } from '../components/ui'
import { ChannelLegend, LeadsChart } from '../components/LeadsChart'

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: '#25d366',
  instagram: '#dd2a7b',
  site: '#64748b',
  phone: '#e5a63c',
}

function Delta({ value, suffix = '%', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (!value) return <span className="delta flat">0{suffix}</span>
  const positive = invert ? value < 0 : value > 0
  return (
    <span className={`delta ${positive ? 'up' : 'down'}`}>
      <Icon name={value > 0 ? 'arrowUp' : 'arrowDown'} size={11} />
      {Math.abs(value)}
      {suffix}
    </span>
  )
}

interface KpiProps {
  label: string
  value: string | number
  unit?: string
  delta: number
  deltaSuffix?: string
  invert?: boolean
  icon: IconName
  color: string
  soft: string
  foot: string
}

function Kpi({ label, value, unit, delta, deltaSuffix = '%', invert, icon, color, soft, foot }: KpiProps) {
  return (
    <article className="kpi">
      <div className="kpi-top">
        <span className="kpi-icon" style={{ background: soft, color }}>
          <Icon name={icon} size={17} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="kpi-foot">
        <Delta value={delta} suffix={deltaSuffix} invert={invert} />
        <span>{foot}</span>
      </div>
    </article>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<Lead[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const load = async () => {
      const [statsPayload, leads, doctorsPayload] = await Promise.all([
        getStats(),
        getLeads({ status: 'new' }),
        getDoctors(),
      ])
      if (!alive) return
      setStats(statsPayload)
      setRecent(leads.items.slice(0, 5))
      setDoctors(doctorsPayload.items)
      setLoading(false)
    }

    void load()
    connectRealtime()
    const unsubscribe = subscribe((type) => {
      if (type.startsWith('lead')) void load()
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  const totalChannel = stats?.byChannel.reduce((sum, item) => sum + item.count, 0) || 1

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Добрый день, Анна</h1>
          <div className="page-sub">
            {today} · {stats ? `${stats.newLeads} новых обращений сегодня` : 'загружаем данные…'}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/channels')}>
            <Icon name="plug" size={16} />
            Каналы
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/leads?new=1')}>
            <Icon name="plus" size={16} />
            Создать заявку
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        {stats ? (
          <>
            <Kpi
              label="Новые заявки"
              value={stats.newLeads}
              delta={stats.newLeadsDelta}
              icon="inbox"
              color="#2456b8"
              soft="#EAF1FE"
              foot="к вчерашнему дню"
            />
            <Kpi
              label="Записей на сегодня"
              value={stats.appointmentsToday}
              delta={stats.appointmentsDelta}
              deltaSuffix=""
              icon="calendar"
              color="#0A7D61"
              soft="#E6F7F1"
              foot="в расписании"
            />
            <Kpi
              label="Конверсия в запись"
              value={stats.conversion}
              unit="%"
              delta={stats.conversionDelta}
              deltaSuffix=" п.п."
              icon="trending"
              color="#6D3FD1"
              soft="#F1ECFE"
              foot="за месяц"
            />
            <Kpi
              label="Среднее время ответа"
              value={stats.avgResponseMin}
              unit="мин"
              delta={stats.avgResponseDelta}
              deltaSuffix=" мин"
              invert
              icon="clock"
              color="#8A5A06"
              soft="#FDF4E3"
              foot="быстрее нормы"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, index) => (
            <div className="kpi" key={index}>
              <div className="skeleton" style={{ height: 84 }} />
            </div>
          ))
        )}
      </div>

      <div className="dash-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Поток обращений</div>
                <div className="card-sub">Последние 7 дней, с разбивкой по каналам</div>
              </div>
              <ChannelLegend />
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              {stats ? <LeadsChart series={stats.series} /> : <div className="skeleton" style={{ height: 208 }} />}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Новые заявки</div>
                <div className="card-sub">Требуют ответа администратора</div>
              </div>
              <button className="btn-link" onClick={() => navigate('/leads')}>
                Все заявки
                <Icon name="chevronRight" size={14} />
              </button>
            </div>

            {loading ? (
              <SkeletonRows rows={4} />
            ) : recent.length ? (
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="data">
                  <tbody>
                    {recent.map((lead) => (
                      <tr key={lead.id} onClick={() => navigate(`/leads?q=${encodeURIComponent(lead.name)}`)}>
                        <td style={{ width: 220 }}>
                          <div className="cell-name">
                            <Avatar name={lead.name} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div className="title">{lead.name}</div>
                              <div className="sub">{lead.phone ?? lead.handle}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ width: 120 }}>
                          <ChannelTag channel={lead.channel} />
                        </td>
                        <td>
                          <div className="nowrap">{lead.service}</div>
                          <div className="sub muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.messages.at(-1)?.text}
                          </div>
                        </td>
                        <td style={{ width: 96 }} className="nowrap">
                          <StatusBadge status={lead.status} />
                        </td>
                        <td className="t-right nowrap muted" style={{ width: 96 }}>
                          {relativeTime(lead.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span className="icon-wrap">
                  <Icon name="check" size={20} />
                </span>
                <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Все заявки обработаны</div>
                <div style={{ fontSize: 12.5 }}>Новые обращения появятся здесь автоматически</div>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Источники заявок</div>
                <div className="card-sub">Распределение за всё время</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {stats?.byChannel
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((item) => {
                  const share = Math.round((item.count / totalChannel) * 100)
                  return (
                    <div className="source-row" key={item.channel}>
                      <ChannelIcon channel={item.channel} size={26} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 550 }}>{CHANNEL_LABEL[item.channel]}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {share}% обращений
                        </div>
                      </div>
                      <div className="source-bar">
                        {item.count}
                        <span className="source-track">
                          <span
                            className="source-fill"
                            style={{ width: `${share}%`, background: CHANNEL_COLOR[item.channel] }}
                          />
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Загрузка врачей</div>
                <div className="card-sub">Приёмы на сегодня</div>
              </div>
              <button className="btn-link" onClick={() => navigate('/schedule')}>
                Расписание
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className="card-body" style={{ paddingTop: 4 }}>
              {stats?.doctorsLoad.map((doctor) => (
                <div className="load-row" key={doctor.id}>
                  <span
                    className="avatar"
                    style={{
                      width: 28,
                      height: 28,
                      fontSize: 10,
                      background: doctor.color,
                      borderRadius: 9,
                    }}
                  >
                    {initials(doctor.name)}
                  </span>
                  <div style={{ width: 128, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doctor.name.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {doctor.todayAppointments} приёма
                    </div>
                  </div>
                  <span className="load-track">
                    <span
                      className="load-fill"
                      style={{
                        width: `${doctor.loadPercent}%`,
                        background: doctor.loadPercent > 85 ? '#DD5157' : doctor.color,
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', width: 30, textAlign: 'right' }}>
                    {doctor.loadPercent}%
                  </span>
                </div>
              ))}
              {!stats && <SkeletonRows rows={4} />}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Последние отзывы</div>
                <div className="card-sub">
                  {stats ? `Средняя оценка ${(stats.recentReviews.reduce((sum, r) => sum + r.rating, 0) / Math.max(stats.recentReviews.length, 1)).toFixed(1)}` : '—'}
                </div>
              </div>
              <button className="btn-link" onClick={() => navigate('/reviews')}>
                Все
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className="card-body" style={{ paddingTop: 8, display: 'grid', gap: 12 }}>
              {stats?.recentReviews.map((review) => (
                <div key={review.id} style={{ display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Stars value={review.rating} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{review.author}</span>
                    <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                      {relativeTime(review.at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {review.text.length > 96 ? `${review.text.slice(0, 96)}…` : review.text}
                  </div>
                </div>
              ))}
              {!stats && <SkeletonRows rows={3} />}
            </div>
          </section>
        </div>
      </div>

      {doctors.length > 0 && stats && (
        <div className="hint-box" style={{ marginTop: 16 }}>
          <Icon name="bolt" size={16} />
          <div>
            Сейчас в работе {stats.doctorsLoad.reduce((sum, d) => sum + d.todayAppointments, 0)} приёмов, свободные окна
            есть у {doctors.filter((doctor) => doctor.loadPercent < 70).length} врачей. Заявки из WhatsApp и Instagram
            приходят в раздел «Заявки» автоматически — отвечать можно прямо из карточки обращения.
          </div>
        </div>
      )}
    </>
  )
}
