import { useEffect, useMemo, useState } from 'react'
import type { Doctor, Patient } from '../../shared/types'
import { getDoctors, getPatients } from '../lib/api'
import { formatDate, money, plural, relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, EmptyState, Modal, SkeletonRows } from '../components/ui'

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Patient | null>(null)

  useEffect(() => {
    void getDoctors().then((payload) => setDoctors(payload.items))
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      void getPatients(query).then((payload) => {
        if (!alive) return
        setPatients(payload.items)
        setTotal(payload.total)
        setLoading(false)
      })
    }, 220)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const doctorName = (id?: string) => doctors.find((doctor) => doctor.id === id)?.name ?? '—'
  const doctorColor = (id?: string) => doctors.find((doctor) => doctor.id === id)?.color ?? '#0E9E7B'

  const summary = useMemo(() => {
    const revenue = patients.reduce((sum, patient) => sum + patient.totalSpent, 0)
    const monthAgo = Date.now() - 30 * 86_400_000
    const fresh = patients.filter((patient) => +new Date(patient.since) > monthAgo).length
    const repeat = patients.filter((patient) => patient.visits > 1).length
    return {
      revenue,
      average: patients.length ? Math.round(revenue / patients.length) : 0,
      fresh,
      repeatShare: patients.length ? Math.round((repeat / patients.length) * 100) : 0,
    }
  }, [patients])

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">База пациентов</h1>
          <div className="page-sub">
            {total} {plural(total, ['пациент', 'пациента', 'пациентов'])} · история визитов и контакты
          </div>
        </div>
        <div className="page-actions">
          <div className="search" style={{ width: 260, margin: 0 }}>
            <Icon name="search" size={15} />
            <input
              placeholder="Имя, телефон, тег"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="btn btn-primary">
            <Icon name="plus" size={16} />
            Добавить пациента
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon" style={{ background: '#EAF1FE', color: '#2456B8' }}>
              <Icon name="users" size={17} />
            </span>
            <span className="kpi-label">Всего в базе</span>
          </div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-foot">карточек пациентов</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon" style={{ background: '#E6F7F1', color: '#0A7D61' }}>
              <Icon name="sparkles" size={17} />
            </span>
            <span className="kpi-label">Новые за месяц</span>
          </div>
          <div className="kpi-value">{summary.fresh}</div>
          <div className="kpi-foot">первичных обращений</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon" style={{ background: '#F1ECFE', color: '#6D3FD1' }}>
              <Icon name="refresh" size={17} />
            </span>
            <span className="kpi-label">Повторные визиты</span>
          </div>
          <div className="kpi-value">{summary.repeatShare}<small>%</small></div>
          <div className="kpi-foot">возвращаются в клинику</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon" style={{ background: '#FDF4E3', color: '#8A5A06' }}>
              <Icon name="card" size={17} />
            </span>
            <span className="kpi-label">Средний чек</span>
          </div>
          <div className="kpi-value">{new Intl.NumberFormat('ru-RU').format(summary.average)}<small>₽</small></div>
          <div className="kpi-foot">за всё время</div>
        </div>
      </div>

      <section className="card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : patients.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Пациент</th>
                  <th>Телефон</th>
                  <th>Лечащий врач</th>
                  <th>Визиты</th>
                  <th>Последний визит</th>
                  <th className="t-right">Сумма</th>
                  <th>Теги</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id} onClick={() => setSelected(patient)}>
                    <td style={{ width: 240 }}>
                      <div className="cell-name">
                        <Avatar name={patient.name} size={34} />
                        <div>
                          <div className="title">{patient.name}</div>
                          <div className="sub">в клинике с {formatDate(patient.since).slice(-4)} года</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{patient.phone}</td>
                    <td style={{ width: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 99,
                            background: doctorColor(patient.doctorId),
                          }}
                        />
                        <span style={{ fontSize: 12.5 }}>{doctorName(patient.doctorId)}</span>
                      </div>
                    </td>
                    <td style={{ width: 80 }}>{patient.visits}</td>
                    <td style={{ width: 140 }} className="muted nowrap">
                      {relativeTime(patient.lastVisit)}
                    </td>
                    <td className="t-right nowrap" style={{ fontWeight: 600 }}>
                      {money(patient.totalSpent)}
                    </td>
                    <td style={{ width: 180 }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {patient.tags.slice(0, 2).map((tag) => (
                          <span className="pill" key={tag} style={{ height: 22, fontSize: 11 }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Пациент не найден" text="Измените запрос или добавьте нового пациента." icon="users" />
        )}
      </section>

      {selected && (
        <Modal
          title={selected.name}
          subtitle={`${selected.phone} · в клинике с ${formatDate(selected.since)}`}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                Закрыть
              </button>
              <button className="btn btn-primary">
                <Icon name="calendar" size={15} />
                Записать на приём
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Визитов', value: String(selected.visits) },
              { label: 'Потрачено', value: money(selected.totalSpent) },
              { label: 'Последний визит', value: relativeTime(selected.lastVisit) },
            ].map((item) => (
              <div
                key={item.label}
                style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}
              >
                <div className="muted" style={{ fontSize: 11.5 }}>{item.label}</div>
                <div style={{ fontWeight: 650, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="kv">
            <span className="k">Лечащий врач</span>
            <span className="v">{doctorName(selected.doctorId)}</span>
          </div>
          <div className="kv">
            <span className="k">Дата рождения</span>
            <span className="v">{selected.birthDate ? formatDate(selected.birthDate) : 'не указана'}</span>
          </div>
          <div className="kv">
            <span className="k">Теги</span>
            <span className="v" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {selected.tags.map((tag) => (
                <span className="pill" key={tag} style={{ height: 22, fontSize: 11 }}>
                  {tag}
                </span>
              ))}
            </span>
          </div>
          {selected.notes && (
            <div className="hint-box warn">
              <Icon name="alert" size={15} />
              <div>{selected.notes}</div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
