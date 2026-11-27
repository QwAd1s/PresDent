import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Appointment, Doctor, Patient } from '../../shared/types'
import type { SlotOffer } from '../../shared/slots'
import {
  bookAppointment,
  getAppointments,
  getDoctors,
  getPatients,
  getServices,
  getSlots,
  rescheduleAppointment,
  updateAppointment,
  type SlotsPayload,
} from '../lib/api'
import { formatPrice } from '../../shared/services'
import type { Service } from '../../shared/services'
import { formatTime, plural } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, ChannelTag, EmptyState, Field, Modal, SkeletonRows } from '../components/ui'

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const STATUS_LABEL: Record<Appointment['status'], string> = {
  confirmed: 'Подтверждён',
  waiting: 'Пациент пришёл',
  done: 'Завершён',
  cancelled: 'Отменён',
}

const STATUS_STYLE: Record<Appointment['status'], { bg: string; border: string; color: string }> = {
  confirmed: { bg: '#EAF1FE', border: '#d7e3fb', color: '#2456B8' },
  waiting: { bg: '#FDF4E3', border: '#f6e2b8', color: '#8A5A06' },
  done: { bg: '#EEF2F4', border: '#e1e8ec', color: '#4A616C' },
  cancelled: { bg: '#FDECEC', border: '#f6d3d4', color: '#B8373C' },
}

type BookingPrefill = { name: string; phone: string; service: string }
type ModalState =
  | { mode: 'create'; prefill?: BookingPrefill }
  | { mode: 'reschedule'; appointment: Appointment }

export default function Schedule() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [date, setDate] = useState(toDateInput(new Date()))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [appointmentsPayload, doctorsPayload, patientsPayload, servicesPayload] = await Promise.all([
      getAppointments(),
      getDoctors(),
      getPatients(),
      getServices(),
    ])
    setAppointments(appointmentsPayload.items)
    setDoctors(doctorsPayload.items)
    setPatients(patientsPayload.items)
    setServices(servicesPayload.items)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Переход из заявки: «Записать на приём» открывает форму с подставленными данными
  useEffect(() => {
    if (searchParams.get('book') !== '1') return
    setModal({
      mode: 'create',
      prefill: {
        name: searchParams.get('name') ?? '',
        phone: searchParams.get('phone') ?? '',
        service: searchParams.get('service') ?? 'Консультация',
      },
    })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  // Переход «Профиль» из карточки врача: показываем только его приёмы
  useEffect(() => {
    const doctorParam = searchParams.get('doctor')
    if (!doctorParam) return
    setDoctorFilter(doctorParam)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const dayDate = new Date(`${date}T00:00:00`)
  const dayLabel = dayDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

  const doctorOf = (id: string) => doctors.find((doctor) => doctor.id === id)

  const dayAppointments = appointments
    .filter((appointment) => sameDay(new Date(appointment.start), dayDate))
    .filter((appointment) => (doctorFilter ? appointment.doctorId === doctorFilter : true))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))

  const shiftDate = (days: number) => {
    const next = new Date(dayDate)
    next.setDate(next.getDate() + days)
    setDate(toDateInput(next))
  }

  const changeStatus = async (appointment: Appointment, status: Appointment['status']) => {
    setBusy(true)
    const result = await updateAppointment(appointment.id, { status })
    setBusy(false)
    if (!result.ok || !result.appointment) {
      setToast(result.error ?? 'Не удалось обновить запись')
      return
    }
    setAppointments((current) => current.map((item) => (item.id === result.appointment!.id ? result.appointment! : item)))
    setSelected(result.appointment)
    setConfirmCancel(false)
    setToast(`Статус изменён: ${STATUS_LABEL[status].toLowerCase()}`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Расписание</h1>
          <div className="page-sub">
            {dayLabel} · {dayAppointments.length} {plural(dayAppointments.length, ['приём', 'приёма', 'приёмов'])}
          </div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(-1)} aria-label="Предыдущий день">
              <Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(toDateInput(new Date()))}>
              Сегодня
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(1)} aria-label="Следующий день">
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            style={{ width: 158 }}
          />
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            <Icon name="plus" size={16} />
            Записать пациента
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <button
          className={`pill ${doctorFilter === null ? 'active' : ''}`}
          onClick={() => setDoctorFilter(null)}
          type="button"
        >
          Все врачи
        </button>
        {doctors.map((doctor) => (
          <button
            key={doctor.id}
            type="button"
            className={`pill ${doctorFilter === doctor.id ? 'active' : ''}`}
            onClick={() => setDoctorFilter(doctorFilter === doctor.id ? null : doctor.id)}
          >
            <span style={{ width: 7, height: 7, borderRadius: 99, background: doctor.color }} />
            {doctor.name.split(' ').slice(0, 2).join(' ')}
          </button>
        ))}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          {doctorFilter ? 'Показан один врач · нажмите ещё раз, чтобы сбросить' : 'Клик по приёму — статус, перенос, отмена'}
        </span>
      </div>

      <section className="card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : dayAppointments.length ? (
          <div className="day-list">
            {dayAppointments.map((appointment) => {
              const doctor = doctorOf(appointment.doctorId)
              const end = new Date(new Date(appointment.start).getTime() + appointment.durationMin * 60_000)
              const cancelled = appointment.status === 'cancelled'
              const tone = STATUS_STYLE[appointment.status]

              return (
                <button
                  key={appointment.id}
                  type="button"
                  className="day-row"
                  onClick={() => {
                    setSelected(appointment)
                    setConfirmCancel(false)
                  }}
                  style={cancelled ? { opacity: 0.6 } : undefined}
                >
                  <span className="day-time">
                    {formatTime(appointment.start)}–{formatTime(end.toISOString())}
                  </span>

                  <span className="day-patient">
                    <b style={cancelled ? { textDecoration: 'line-through' } : undefined}>
                      {appointment.patientName}
                    </b>
                    <small>{appointment.phone || 'без телефона'}</small>
                  </span>

                  <span className="day-doctor">
                    <i style={{ background: doctor?.color ?? '#0E9E7B' }} />
                    {doctor?.name.split(' ').slice(0, 2).join(' ') ?? '—'}
                  </span>

                  <span className="day-service">{appointment.service}</span>

                  <span className="badge" style={{ background: tone.bg, color: tone.color }}>
                    {STATUS_LABEL[appointment.status]}
                  </span>

                  <Icon name="chevronRight" size={15} style={{ color: 'var(--ink-3)' }} />
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="На этот день приёмов нет"
            text={
              doctorFilter
                ? 'У выбранного врача на эту дату записей нет — снимите фильтр или выберите другой день.'
                : 'Запишите пациента — приём сразу появится в этом списке.'
            }
            icon="calendar"
          />
        )}
      </section>

      {selected && !modal && (
        <Modal
          title={selected.patientName}
          subtitle={`${selected.service} · ${formatTime(selected.start)} · ${selected.durationMin} мин`}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                Закрыть
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setModal({ mode: 'reschedule', appointment: selected })
                }}
              >
                <Icon name="calendar" size={15} />
                Перенести
              </button>
              {selected.status !== 'waiting' && selected.status !== 'done' && (
                <button className="btn btn-soft" disabled={busy} onClick={() => void changeStatus(selected, 'waiting')}>
                  <Icon name="check" size={15} />
                  Пациент пришёл
                </button>
              )}
              {selected.status === 'waiting' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => void changeStatus(selected, 'done')}>
                  <Icon name="checkCheck" size={15} />
                  Завершить приём
                </button>
              )}
            </>
          }
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="badge"
              style={{
                background: STATUS_STYLE[selected.status].bg,
                color: STATUS_STYLE[selected.status].color,
                border: `1px solid ${STATUS_STYLE[selected.status].border}`,
              }}
            >
              {STATUS_LABEL[selected.status]}
            </span>
            <ChannelTag channel={selected.channel} />
            {services.find((item) => item.title === selected.service) && (
        <span className="pill">{formatPrice(services.find((item) => item.title === selected.service)!.price)}</span>
      )}
          </div>

          <div className="kv">
            <span className="k">Врач</span>
            <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar
                name={doctorOf(selected.doctorId)?.name ?? '—'}
                size={26}
                color={doctorOf(selected.doctorId)?.color}
              />
              {doctorOf(selected.doctorId)?.name ?? '—'}
            </span>
          </div>
          <div className="kv">
            <span className="k">Телефон</span>
            <span className="v">
              <a href={`tel:${selected.phone.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--brand-dark)' }}>
                {selected.phone || 'не указан'}
              </a>
            </span>
          </div>
          <div className="kv">
            <span className="k">Начало</span>
            <span className="v">
              {new Date(selected.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })},{' '}
              {formatTime(selected.start)}
            </span>
          </div>
          {selected.note && (
            <div className="hint-box" style={{ marginTop: 6 }}>
              <Icon name="message" size={15} />
              <div>{selected.note}</div>
            </div>
          )}

          {selected.status !== 'cancelled' &&
            (confirmCancel ? (
              <div className="hint-box warn" style={{ marginTop: 6 }}>
                <Icon name="alert" size={15} />
                <div style={{ flex: 1 }}>Отменить приём? Пациенту нужно будет предложить другое время.</div>
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void changeStatus(selected, 'cancelled')}>
                  Да, отменить
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(false)}>
                  Нет
                </button>
              </div>
            ) : (
              <button className="btn-link" style={{ marginTop: 6 }} onClick={() => setConfirmCancel(true)}>
                <Icon name="x" size={14} />
                Отменить приём
              </button>
            ))}
        </Modal>
      )}

      {modal && (
        <BookingModal
          mode={modal.mode}
          appointment={modal.mode === 'reschedule' ? modal.appointment : undefined}
          initial={modal.mode === 'create' ? modal.prefill : undefined}
          doctors={doctors}
          patients={patients}
          services={services}
          onClose={() => {
            setModal(null)
            setSelected(null)
          }}
          onDone={async (message) => {
            setModal(null)
            setSelected(null)
            setToast(message)
            await load()
          }}
        />
      )}
    </>
  )
}

// ─── Форма записи / переноса ────────────────────────────────────────────────

interface BookingModalProps {
  mode: 'create' | 'reschedule'
  appointment?: Appointment
  initial?: BookingPrefill
  doctors: Doctor[]
  patients: Patient[]
  services: Service[]
  onClose: () => void
  onDone: (message: string) => void | Promise<void>
}

function BookingModal({ mode, appointment, initial, doctors, patients, services, onClose, onDone }: BookingModalProps) {
  const activeServices = services.filter((item) => item.active !== false)
  const isReschedule = mode === 'reschedule'

  const initialService = appointment?.service ?? initial?.service ?? activeServices[0]?.title ?? 'Консультация'
  const initialSpecialty = services.find((item) => item.title === initialService)?.specialty ?? ''
  const initialDoctor =
    doctors.find((doctor) => doctor.specialty.toLowerCase().includes(initialSpecialty))?.id ?? doctors[0]?.id ?? ''

  const [patientName, setPatientName] = useState(appointment?.patientName ?? initial?.name ?? '')
  const [phone, setPhone] = useState(appointment?.phone ?? initial?.phone ?? '')
  const [doctorId, setDoctorId] = useState(appointment?.doctorId ?? initialDoctor)
  const [service, setService] = useState(initialService)
  const [date, setDate] = useState(
    toDateInput(appointment ? new Date(appointment.start) : new Date()),
  )
  const [slots, setSlots] = useState<SlotsPayload | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [start, setStart] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestRef = useRef(0)

  const serviceInfo = services.find((item) => item.title === service)
  const duration = appointment?.durationMin ?? serviceInfo?.durationMin ?? 60
  const price = serviceInfo?.price

  const loadSlots = useCallback(async () => {
    if (!doctorId || !date) return
    const request = requestRef.current + 1
    requestRef.current = request
    setLoadingSlots(true)
    setStart(null)

    const payload = await getSlots(doctorId, date, service)
    if (requestRef.current !== request) return

    setSlots(payload)
    setLoadingSlots(false)
    setStart(payload.items[0]?.start ?? null)
  }, [doctorId, date, service])

  useEffect(() => {
    const timer = setTimeout(() => void loadSlots(), 200)
    return () => clearTimeout(timer)
  }, [loadSlots])

  const pickDoctorForService = (nextService: string) => {
    const target = services.find((item) => item.title === nextService)
    if (!target) return
    const match = doctors.find((doctor) => doctor.specialty.toLowerCase().includes(target.specialty))
    if (match) setDoctorId(match.id)
  }

  const submit = async () => {
    if (busy) return
    if (!isReschedule && patientName.trim().length < 2) {
      setError('Укажите имя пациента')
      return
    }
    if (!start) {
      setError('Выберите свободное время')
      return
    }

    setBusy(true)
    setError(null)

    if (isReschedule && appointment) {
      const result = await rescheduleAppointment(appointment.id, start)
      setBusy(false)
      if (!result.ok) {
        setError(result.error ?? 'Не удалось перенести')
        await loadSlots()
        return
      }
      await onDone(`Приём перенесён на ${formatTime(start)}`)
      return
    }

    const result = await bookAppointment({
      patientName: patientName.trim(),
      phone: phone.trim(),
      doctorId,
      service,
      start,
      durationMin: duration,
      channel: 'phone',
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось создать запись')
      await loadSlots()
      return
    }
    await onDone(`Запись создана: ${patientName.trim()} на ${formatTime(start)}`)
  }

  return (
    <Modal
      title={isReschedule ? 'Перенести приём' : 'Новая запись'}
      subtitle={
        isReschedule
          ? `${appointment?.patientName} · было ${formatTime(appointment?.start ?? '')}`
          : 'Свободные окна подбираются автоматически по расписанию врача'
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={busy || !start} onClick={() => void submit()}>
            <Icon name={isReschedule ? 'calendar' : 'plus'} size={15} />
            {busy ? 'Сохраняем…' : isReschedule ? 'Перенести' : 'Записать'}
          </button>
        </>
      }
    >
      {!isReschedule && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Пациент">
            <input
              className="input"
              list="patients-list"
              value={patientName}
              onChange={(event) => {
                setPatientName(event.target.value)
                const match = patients.find((item) => item.name === event.target.value)
                if (match) setPhone(match.phone)
              }}
              placeholder="Имя и фамилия"
            />
            <datalist id="patients-list">
              {patients.map((patient) => (
                <option key={patient.id} value={patient.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Телефон">
            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 ..." />
          </Field>
          <Field label="Услуга" hint={price ? `${formatPrice(price)} · ${duration} мин` : undefined}>
            <select
              className="select"
              value={service}
              onChange={(event) => {
                setService(event.target.value)
                pickDoctorForService(event.target.value)
              }}
            >
              {activeServices.map((item) => (
                <option key={item.id} value={item.title}>
                  {item.title} — {formatPrice(item.price)}
                </option>
              ))}
              {!serviceInfo && service && <option value={service}>{service}</option>}
            </select>
          </Field>
          <Field label="Врач">
            <select className="select" value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name} — {doctor.specialty}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isReschedule ? '1fr' : '1fr 1fr', gap: 12 }}>
        <Field label="Дата">
          <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        {isReschedule && (
          <div className="field">
            <label>Врач и услуга</label>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {doctors.find((doctor) => doctor.id === doctorId)?.name ?? '—'} · {service}
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Свободное время</span>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {slots ? slots.dayLabel : ''}
          </span>
          {slots && !slots.workingDay && (
            <span className="badge status-spam" style={{ marginLeft: 'auto' }}>
              врач не принимает
            </span>
          )}
        </div>

        {loadingSlots ? (
          <div className="skeleton" style={{ height: 40 }} />
        ) : slots && slots.items.length > 0 ? (
          <div className="slot-grid">
            {slots.items.map((slot: SlotOffer) => (
              <button
                key={slot.id}
                className={`slot-btn ${start === slot.start ? 'selected' : ''}`}
                style={
                  start === slot.start
                    ? { borderColor: 'var(--brand)', background: 'var(--brand-soft)', boxShadow: '0 0 0 2px var(--brand-ring)' }
                    : undefined
                }
                onClick={() => setStart(slot.start)}
              >
                <b>{slot.label}</b>
                <span>{formatTime(new Date(new Date(slot.start).getTime() + duration * 60_000).toISOString())}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            {slots?.workingDay === false
              ? 'В этот день врач не принимает — выберите другую дату.'
              : 'Свободных окон нет. Попробуйте другую дату.'}
          </div>
        )}
      </div>

      {error && (
        <div className="hint-box warn">
          <Icon name="alert" size={15} />
          <div>{error}</div>
        </div>
      )}
    </Modal>
  )
}
