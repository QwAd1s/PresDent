import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Appointment, Doctor } from '../../shared/types'
import { getAppointments, getDoctors } from '../lib/api'
import { formatTime, weekday } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, ChannelTag, Modal, SkeletonRows } from '../components/ui'

const START_HOUR = 9
const END_HOUR = 21
const ROW = 64
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index)

const startOfWeek = (offset: number) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift + offset * 7)
  return date
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export default function Schedule() {
  const navigate = useNavigate()
  const [offset, setOffset] = useState(0)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appointment | null>(null)

  useEffect(() => {
    void Promise.all([getAppointments(), getDoctors()]).then(([appointmentsPayload, doctorsPayload]) => {
      setAppointments(appointmentsPayload.items)
      setDoctors(doctorsPayload.items)
      setLoading(false)
    })
  }, [])

  const monday = useMemo(() => startOfWeek(offset), [offset])
  const days = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  }), [monday])

  const weekLabel = `${days[0].getDate()} — ${days[5].getDate()} ${
    days[5].toLocaleDateString('ru-RU', { month: 'long' })
  }`

  const doctorOf = (id: string) => doctors.find((doctor) => doctor.id === id)

  const nowLeft = useMemo(() => {
    const now = new Date()
    const hours = now.getHours() + now.getMinutes() / 60
    if (hours < START_HOUR || hours > END_HOUR) return null
    return (hours - START_HOUR) * ROW
  }, [])

  const todayIndex = days.findIndex((day) => sameDay(day, new Date()))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Расписание</h1>
          <div className="page-sub">Неделя {weekLabel} · приёмы всех врачей</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(offset - 1)} aria-label="Предыдущая неделя">
              <Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(0)}>
              Сегодня
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(offset + 1)} aria-label="Следующая неделя">
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/leads')}>
            <Icon name="plus" size={16} />
            Записать пациента
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {doctors.map((doctor) => (
          <span key={doctor.id} className="pill">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: doctor.color }} />
            {doctor.name.split(' ').slice(0, 2).join(' ')}
          </span>
        ))}
      </div>

      <section className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <SkeletonRows rows={8} />
        ) : (
          <div className="schedule-wrap">
            <div style={{ minWidth: 860 }}>
              <div className="schedule-head">
                <div className="schedule-head-cell" />
                {days.map((day, index) => (
                  <div key={day.toISOString()} className={`schedule-head-cell ${index === todayIndex ? 'today' : ''}`}>
                    {weekday(day)}
                    <small>
                      {day.getDate()} {day.toLocaleDateString('ru-RU', { month: 'short' })}
                    </small>
                  </div>
                ))}
              </div>

              <div className="schedule">
                <div>
                  {HOURS.map((hour) => (
                    <div className="schedule-hour" key={hour}>
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {days.map((day, dayIndex) => (
                  <div className="schedule-col" key={day.toISOString()}>
                    {HOURS.map((hour) => (
                      <div className="schedule-cell" key={hour} />
                    ))}

                    {dayIndex === todayIndex && nowLeft !== null && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: nowLeft,
                          height: 2,
                          background: '#DD5157',
                          zIndex: 3,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 2,
                            top: -6,
                            width: 8,
                            height: 8,
                            borderRadius: 99,
                            background: '#DD5157',
                          }}
                        />
                      </div>
                    )}

                    {appointments
                      .filter((appointment) => sameDay(new Date(appointment.start), day))
                      .filter((appointment) => {
                        const date = new Date(appointment.start)
                        const hours = date.getHours() + date.getMinutes() / 60
                        return hours >= START_HOUR && hours < END_HOUR
                      })
                      .map((appointment) => {
                        const date = new Date(appointment.start)
                        const doctor = doctorOf(appointment.doctorId)
                        const top = (date.getHours() + date.getMinutes() / 60 - START_HOUR) * ROW
                        const height = Math.max((appointment.durationMin / 60) * ROW - 4, 34)
                        const color = doctor?.color ?? '#0E9E7B'
                        const done = appointment.status === 'done'

                        return (
                          <div
                            key={appointment.id}
                            className="appt"
                            onClick={() => setSelected(appointment)}
                            style={{
                              top,
                              height,
                              background: `${color}14`,
                              borderLeftColor: color,
                              opacity: done ? 0.62 : 1,
                              borderTop: `1px solid ${color}22`,
                              borderRight: `1px solid ${color}22`,
                              borderBottom: `1px solid ${color}22`,
                            }}
                            title={`${appointment.patientName} · ${appointment.service}`}
                          >
                            <b>{appointment.patientName}</b>
                            <span>
                              {formatTime(appointment.start)} · {appointment.service}
                            </span>
                            {height > 56 && <span>{doctor?.name.split(' ').slice(0, 2).join(' ')}</span>}
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <Modal
          title={selected.patientName}
          subtitle={`${selected.service} · ${formatTime(selected.start)}`}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                Закрыть
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/leads')}>
                Открыть заявку
              </button>
            </>
          }
        >
          <div className="kv">
            <span className="k">Врач</span>
            <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={doctorOf(selected.doctorId)?.name ?? '—'} size={26} color={doctorOf(selected.doctorId)?.color} />
              {doctorOf(selected.doctorId)?.name ?? '—'}
            </span>
          </div>
          <div className="kv">
            <span className="k">Телефон</span>
            <span className="v">{selected.phone}</span>
          </div>
          <div className="kv">
            <span className="k">Длительность</span>
            <span className="v">{selected.durationMin} мин</span>
          </div>
          <div className="kv">
            <span className="k">Источник записи</span>
            <span className="v">
              <ChannelTag channel={selected.channel} />
            </span>
          </div>
        </Modal>
      )}
    </>
  )
}
