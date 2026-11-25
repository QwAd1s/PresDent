import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Doctor } from '../../shared/types'
import { getDoctors } from '../lib/api'
import { formatTime, plural } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, SkeletonRows, Stars } from '../components/ui'

export default function Doctors() {
  const navigate = useNavigate()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getDoctors().then((payload) => {
      setDoctors(payload.items)
      setLoading(false)
    })
  }, [])

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Врачи</h1>
          <div className="page-sub">
            {doctors.length} {plural(doctors.length, ['специалист', 'специалиста', 'специалистов'])} · рейтинг, загрузка
            и ближайшие окна
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/schedule')}>
            <Icon name="calendar" size={16} />
            Расписание
          </button>
          <button className="btn btn-primary">
            <Icon name="plus" size={16} />
            Добавить врача
          </button>
        </div>
      </div>

      {loading ? (
        <div className="doctor-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="card doctor-card" key={index}>
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="doctor-grid">
          {doctors.map((doctor) => (
            <article className="card doctor-card" key={doctor.id}>
              <div className="doctor-top">
                <Avatar name={doctor.name} size={48} color={doctor.color} radius={14} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 14.5, lineHeight: 1.3 }}>{doctor.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {doctor.specialty} · {doctor.experienceYears} лет опыта
                  </div>
                </div>
                <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <span className="rating">
                    <Icon name="star" size={13} />
                    {doctor.rating.toFixed(1)}
                  </span>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {doctor.reviewsCount} отзывов
                  </div>
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span className="muted">Загрузка сегодня</span>
                  <span style={{ fontWeight: 600 }}>{doctor.loadPercent}%</span>
                </div>
                <span className="load-track" style={{ display: 'block' }}>
                  <span
                    className="load-fill"
                    style={{
                      width: `${doctor.loadPercent}%`,
                      background: doctor.loadPercent > 85 ? '#DD5157' : doctor.color,
                    }}
                  />
                </span>
              </div>

              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <Icon name="calendar" size={13} />
                  {doctor.todayAppointments} приёма
                </span>
                <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <Icon name="clock" size={13} />
                  окно в {formatTime(doctor.nextSlot)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => navigate('/schedule')}>
                  Расписание
                </button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                  Профиль
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Рейтинг врачей</div>
            <div className="card-sub">Средняя оценка по отзывам из WhatsApp и Instagram</div>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <tbody>
              {!loading &&
                doctors
                  .slice()
                  .sort((a, b) => b.rating - a.rating)
                  .map((doctor) => (
                    <tr key={doctor.id} style={{ cursor: 'default' }}>
                      <td style={{ width: 240 }}>
                        <div className="cell-name">
                          <Avatar name={doctor.name} size={30} color={doctor.color} />
                          <div className="title">{doctor.name}</div>
                        </div>
                      </td>
                      <td style={{ width: 150 }} className="muted">
                        {doctor.specialty}
                      </td>
                      <td style={{ width: 120 }}>
                        <Stars value={doctor.rating} />
                      </td>
                      <td style={{ width: 90, fontWeight: 600 }}>{doctor.rating.toFixed(1)}</td>
                      <td className="muted">{doctor.reviewsCount} отзывов</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {loading && <SkeletonRows rows={4} />}
      </section>
    </>
  )
}
