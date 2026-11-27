import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Doctor } from '../../shared/types'
import { createDoctor, getDoctors } from '../lib/api'
import { formatTime, plural } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, Field, Modal, SkeletonRows, Stars } from '../components/ui'

export default function Doctors() {
  const [creating, setCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const navigate = useNavigate()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getDoctors().then((payload) => {
      setDoctors(payload.items)
      setLoading(false)
    })
  }, [reloadKey])

  const hasReviews = doctors.some((doctor) => doctor.reviewsCount > 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Врачи</h1>          <div className="page-sub">
            {doctors.length} {plural(doctors.length, ['специалист', 'специалиста', 'специалистов'])} · рейтинг, загрузка
            и ближайшие окна
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/schedule')}>
            <Icon name="calendar" size={16} />
            Расписание
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
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
                  {doctor.reviewsCount > 0 ? (
                    <>
                      <span className="rating">
                        <Icon name="star" size={13} />
                        {doctor.rating.toFixed(1)}
                      </span>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {doctor.reviewsCount} {plural(doctor.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])}
                      </div>
                    </>
                  ) : (
                    <div className="muted" style={{ fontSize: 11 }}>
                      нет отзывов
                    </div>
                  )}
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
                  {doctor.nextSlot ? `окно в ${formatTime(doctor.nextSlot)}` : 'нет окон'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-soft btn-sm" style={{ flex: 1 }} onClick={() => navigate('/schedule')}>
                  Расписание
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => navigate(`/schedule?doctor=${doctor.id}`)}
                >
                  Профиль
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <CreateDoctorModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            setReloadKey((value) => value + 1)
          }}
        />
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Рейтинг врачей</div>
            <div className="card-sub">
              {hasReviews ? 'Средняя оценка по отзывам пациентов' : 'Появится после первых отзывов'}
            </div>
          </div>
        </div>

        {hasReviews ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <tbody>
                {doctors
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
                      <td className="muted">
                        {doctor.reviewsCount} {plural(doctor.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: '28px 20px' }}>
            <span className="icon-wrap">
              <Icon name="star" size={20} />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Отзывов пока нет</div>
            <div style={{ fontSize: 12.5, maxWidth: 360 }}>
              Звёзды и рейтинг появятся, когда пациенты начнут оставлять оценки — вручную их добавить нельзя.
            </div>
          </div>
        )}

        {loading && <SkeletonRows rows={4} />}
      </section>
    </>
  )
}


const DOCTOR_COLORS = ['#0E9E7B', '#2F6FED', '#C94B8D', '#E8A93A', '#8A5CF6', '#0F8AA8']
const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
]

function CreateDoctorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [experienceYears, setExperienceYears] = useState('5')
  const [color, setColor] = useState(DOCTOR_COLORS[0])
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggleDay = (day: number) =>
    setWorkingDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()))

  const submit = async () => {
    if (busy) return
    if (name.trim().length < 3) {
      setError('Укажите ФИО врача')
      return
    }
    if (!specialty.trim()) {
      setError('Укажите специализацию')
      return
    }
    if (!workingDays.length) {
      setError('Выберите хотя бы один рабочий день')
      return
    }

    setBusy(true)
    setError(null)
    const result = await createDoctor({
      name: name.trim(),
      specialty: specialty.trim(),
      experienceYears: Number(experienceYears) || 0,
      color,
      workingDays,
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось добавить врача')
      return
    }
    onCreated()
  }

  return (
    <Modal
      title="Новый врач"
      subtitle="Появится в расписании и на сайте клиники"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            <Icon name="plus" size={15} />
            {busy ? 'Сохраняем…' : 'Добавить'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="ФИО">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Иванов Иван Иванович" />
        </Field>
        <Field label="Специализация">
          <input
            className="input"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            placeholder="Врач-терапевт"
          />
        </Field>
        <Field label="Стаж, лет">
          <input
            className="input"
            type="number"
            min="0"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
          />
        </Field>
        <Field label="Цвет в расписании">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 36 }}>
            {DOCTOR_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                aria-label={`Цвет ${value}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: value,
                  border: color === value ? '2px solid var(--ink)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </Field>
      </div>

      <Field label="Рабочие дни">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              className={`pill ${workingDays.includes(day.value) ? 'active' : ''}`}
              onClick={() => toggleDay(day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </Field>

      {error && (
        <div className="hint-box warn">
          <Icon name="alert" size={15} />
          <div>{error}</div>
        </div>
      )}
    </Modal>
  )
}
