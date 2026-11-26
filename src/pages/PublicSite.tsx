import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Service } from '../../shared/services'
import { findService, formatPrice } from '../../shared/services'
import {
  bookOnline,
  getClinic,
  getPublicSlots,
  type BookingResult,
  type PublicClinic,
  type PublicDoctor,
  type PublicSlot,
} from '../lib/public-api'
import { formatTime, initials } from '../lib/format'
import { PatientAssistant, type BookingPrefill } from '../components/PatientAssistant'
import './public.css'

type Prefill = BookingPrefill & { token: number }

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const workingDaysLabel = (days: number[]) => {
  const first = days[0] ?? 1
  const last = days[days.length - 1] ?? 6
  return `${WEEKDAY_SHORT[first - 1]}–${WEEKDAY_SHORT[last - 1]}`
}

export default function PublicSite() {
  const [clinic, setClinic] = useState<PublicClinic | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<Prefill | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    getClinic()
      .then(setClinic)
      .catch((error: Error) => setLoadError(error.message))
  }, [])

  useEffect(load, [load])

  const scrollToBooking = () => {
    document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const chooseService = (service: Service) => {
    setPrefill({ service: service.title, token: Date.now() })
    scrollToBooking()
  }

  const handleBotBook = (next: BookingPrefill) => {
    setPrefill({ ...next, token: Date.now() })
    scrollToBooking()
  }

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-shell site-header-inner">
          <a className="site-brand" href="#top">
            <span className="site-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3.2c-2.2 0-3.1 1-5.1 1C5 4.2 3.4 5.9 3.4 8.6c0 3.4 1.7 6 2.6 8.7.5 1.6.9 3.5 2.2 3.5 1.1 0 1.2-1.7 1.5-3.6.2-1.4.6-2.6 2.3-2.6s2.1 1.2 2.3 2.6c.3 1.9.4 3.6 1.5 3.6 1.3 0 1.7-1.9 2.2-3.5.9-2.7 2.6-5.3 2.6-8.7 0-2.7-1.6-4.4-3.5-4.4-2 0-2.9-1-5.1-1z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span>
              <b>PresiDent</b>
              <small>стоматология</small>
            </span>
          </a>

          <nav className="site-nav">
            <a href="#services">Услуги и цены</a>
            <a href="#doctors">Врачи</a>
            <a href="#booking">Онлайн-запись</a>
          </nav>

          <div className="site-header-actions">
            {clinic && (
              <a className="site-phone" href={`tel:${clinic.settings.phone.replace(/[^\d+]/g, '')}`}>
                {clinic.settings.phone}
              </a>
            )}
            <a className="site-btn site-btn-primary" href="#booking">
              Записаться
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="site-hero" id="top">
          <div className="site-shell site-hero-inner">
            <div>
              <span className="site-eyebrow">Стоматология в Грозном · с 2018 года</span>
              <h1>
                Лечим зубы бережно,
                <br />
                записываем за минуту
              </h1>
              <p className="site-hero-text">
                {clinic
                  ? `${clinic.settings.address}. ${clinic.settings.workHours}.`
                  : 'Имплантация, ортодонтия, гигиена и лечение без боли — командой из шести специалистов.'}
              </p>
              <div className="site-hero-actions">
                <a className="site-btn site-btn-primary site-btn-lg" href="#booking">
                  Выбрать время
                </a>
                <a className="site-btn site-btn-ghost site-btn-lg" href="#services">
                  Услуги и цены
                </a>
              </div>

              {clinic && (
                <div className="site-trust">
                  <div>
                    <b>{clinic.trust.rating.toFixed(1)}</b>
                    <span>средняя оценка</span>
                  </div>
                  <div>
                    <b>{clinic.trust.doctors}</b>
                    <span>врачей</span>
                  </div>
                  <div>
                    <b>{clinic.trust.patients}</b>
                    <span>пациентов</span>
                  </div>
                  <div>
                    <b>{clinic.trust.reviews}</b>
                    <span>отзывов</span>
                  </div>
                </div>
              )}
            </div>

            <aside className="site-hero-card">
              <div className="site-hero-card-head">
                <span className="site-dot" />
                Ближайшие окна
              </div>
              {clinic ? (
                <>
                  <div className="site-hero-card-body">
                    {clinic.doctors.slice(0, 3).map((doctor) => (
                      <div className="site-mini-doctor" key={doctor.id}>
                        <span className="site-avatar" style={{ background: doctor.color }}>
                          {initials(doctor.name)}
                        </span>
                        <div>
                          <b>{doctor.name.split(' ').slice(1).join(' ')}</b>
                          <span>{doctor.specialty}</span>
                        </div>
                        <em>{doctor.rating.toFixed(1)} ★</em>
                      </div>
                    ))}
                  </div>
                  <p className="site-hero-card-note">
                    Свободное время подбирается автоматически. Запись занимает не больше минуты.
                  </p>
                </>
              ) : (
                <div className="site-hero-card-body">
                  <div className="site-skeleton" style={{ height: 120 }} />
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="site-section" id="services">
          <div className="site-shell">
            <div className="site-section-head">
              <span className="site-eyebrow">Услуги</span>
              <h2>Понятные цены без сюрпризов</h2>
              <p>Стоимость указана за приём. План и смету врач показывает до начала лечения.</p>
            </div>

            {clinic ? (
              <div className="site-services">
                {clinic.services.map((service) => (
                  <button className="site-service" key={service.id} onClick={() => chooseService(service)}>
                    <span className="site-chip">{service.category}</span>
                    <b>{service.title}</b>
                    <span className="site-service-desc">{service.description}</span>
                    <span className="site-service-foot">
                      <strong>{formatPrice(service.price)}</strong>
                      <em>{service.durationMin} мин</em>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="site-services">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="site-service" key={index}>
                    <div className="site-skeleton" style={{ height: 96 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="site-section site-section-alt" id="doctors">
          <div className="site-shell">
            <div className="site-section-head">
              <span className="site-eyebrow">Команда</span>
              <h2>Врачи, к которым хочется вернуться</h2>
              <p>Каждый специалист ведёт свою специализацию — ничего не «по совместительству».</p>
            </div>

            <div className="site-doctors">
              {clinic?.doctors.map((doctor) => (
                <article className="site-doctor" key={doctor.id}>
                  <span className="site-avatar site-avatar-lg" style={{ background: doctor.color }}>
                    {initials(doctor.name)}
                  </span>
                  <b>{doctor.name}</b>
                  <span className="site-doctor-specialty">{doctor.specialty}</span>
                  <div className="site-doctor-meta">
                    <span>★ {doctor.rating.toFixed(1)}</span>
                    <span>стаж {doctor.experienceYears} лет</span>
                    <span>{workingDaysLabel(doctor.workingDays)}</span>
                  </div>
                  <a className="site-btn site-btn-ghost site-btn-sm" href="#booking">
                    Записаться
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="site-section" id="booking">
          <div className="site-shell">
            <div className="site-section-head">
              <span className="site-eyebrow">Онлайн-запись</span>
              <h2>Выберите время — остальное сделаем мы</h2>
              <p>Слот резервируется сразу. Если планы изменятся — позвоните, перенесём.</p>
            </div>

            {loadError && (
              <div className="site-alert">
                Не удалось загрузить данные клиники: {loadError}. Позвоните нам —
                {clinic?.settings.phone ?? ' +7 495 120-14-14'}.
              </div>
            )}

            {clinic && (
              <BookingForm
                clinic={clinic}
                prefill={prefill}
                onConsumed={() => setPrefill(null)}
              />
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-shell site-footer-inner">
          <div>
            <b>{clinic?.settings.name ?? 'Стоматология PresiDent'}</b>
            <span>{clinic?.settings.address ?? 'Грозный, пр-т А. Кадырова, 24'}</span>
            <span>{clinic?.settings.workHours ?? 'Пн–Сб: 09:00–21:00'}</span>
          </div>
          <div>
            <a href={`tel:${(clinic?.settings.phone ?? '').replace(/[^\d+]/g, '')}`}>
              {clinic?.settings.phone ?? '+7 495 120-14-14'}
            </a>
            <a href={`mailto:${clinic?.settings.email ?? 'hello@president-dental.ru'}`}>
              {clinic?.settings.email ?? 'hello@president-dental.ru'}
            </a>
            <Link className="site-footer-link" to="/login">
              Вход для сотрудников
            </Link>
          </div>
        </div>
      </footer>

      <PatientAssistant onBook={handleBotBook} />
    </div>
  )
}

// ─── Форма записи ───────────────────────────────────────────────────────────

function BookingForm({
  clinic,
  prefill,
  onConsumed,
}: {
  clinic: PublicClinic
  prefill: Prefill | null
  onConsumed: () => void
}) {
  const [service, setService] = useState(clinic.services[0]?.title ?? 'Консультация')
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState(toDateInput(new Date()))
  const [slots, setSlots] = useState<PublicSlot[]>([])
  const [dayInfo, setDayInfo] = useState<{ workingDay: boolean; dayLabel: string } | null>(null)
  const [slot, setSlot] = useState<PublicSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BookingResult | null>(null)
  const desiredStart = useRef<string | null>(null)

  const doctor = useMemo(
    () => clinic.doctors.find((item) => item.id === doctorId) ?? null,
    [clinic.doctors, doctorId],
  )

  const pickDoctorFor = useCallback(
    (serviceTitle: string) => {
      const target = findService(serviceTitle)
      if (!target) return
      const match = clinic.doctors.find((item) => item.specialty.toLowerCase().includes(target.specialty))
      setDoctorId(match?.id ?? clinic.doctors[0]?.id ?? '')
    },
    [clinic.doctors],
  )

  useEffect(() => {
    if (!prefill) return

    if (prefill.service) setService(prefill.service)
    if (prefill.doctorId) setDoctorId(prefill.doctorId)
    else if (prefill.service) pickDoctorFor(prefill.service)
    if (prefill.date) setDate(prefill.date)

    desiredStart.current = prefill.start ?? null
    onConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token])

  useEffect(() => {
    if (!doctorId) pickDoctorFor(service)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!doctorId) return
    let alive = true
    setLoadingSlots(true)
    setSlot(null)

    const timer = setTimeout(() => {
      getPublicSlots(doctorId, date, service)
        .then((payload) => {
          if (!alive) return
          setSlots(payload.items)
          setDayInfo({ workingDay: payload.workingDay, dayLabel: payload.dayLabel })

          const wanted = desiredStart.current
          const match = wanted
            ? payload.items.find((item) => new Date(item.start).getTime() === new Date(wanted).getTime())
            : null
          setSlot(match ?? payload.items[0] ?? null)
          desiredStart.current = null
        })
        .catch(() => {
          if (alive) setSlots([])
        })
        .finally(() => {
          if (alive) setLoadingSlots(false)
        })
    }, 180)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [doctorId, date, service])

  const submit = async () => {
    if (busy) return
    if (name.trim().length < 2) {
      setError('Укажите имя, чтобы врач знал, кого ждать')
      return
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Укажите телефон для подтверждения записи')
      return
    }
    if (!slot) {
      setError('Выберите свободное время')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const booking = await bookOnline({
        name: name.trim(),
        phone: phone.trim(),
        service,
        doctorId,
        start: slot.start,
        comment: comment.trim() || undefined,
      })
      setResult(booking)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось записаться')
      if (doctorId) {
        void getPublicSlots(doctorId, date, service).then((payload) => {
          setSlots(payload.items)
          setSlot(payload.items[0] ?? null)
        })
      }
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="site-success">
        <span className="site-success-mark">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m4.5 12.5 5 5 10-11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3>Вы записаны</h3>
        <p>
          {result.service.title} · {new Date(result.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}{' '}
          в {formatTime(result.start)}
        </p>
        <div className="site-success-card">
          <div>
            <span>Врач</span>
            <b>{result.doctor.name}</b>
          </div>
          <div>
            <span>Стоимость</span>
            <b>{formatPrice(result.service.price)}</b>
          </div>
          <div>
            <span>Адрес</span>
            <b>{clinic.settings.address}</b>
          </div>
        </div>
        <p className="site-success-note">
          Администратор позвонит на {phone} для подтверждения. За 2 часа до приёма не ешьте, если планируется лечение
          под наркозом.
        </p>
        <button
          className="site-btn site-btn-ghost"
          onClick={() => {
            setResult(null)
            setName('')
            setPhone('')
            setComment('')
          }}
        >
          Записать ещё одного пациента
        </button>
      </div>
    )
  }

  return (
    <div className="site-booking">
      <div className="site-booking-grid">
        <label className="site-field">
          <span>Услуга</span>
          <select
            value={service}
            onChange={(event) => {
              setService(event.target.value)
              pickDoctorFor(event.target.value)
            }}
          >
            {clinic.services.map((item) => (
              <option key={item.id} value={item.title}>
                {item.title} — {formatPrice(item.price)}
              </option>
            ))}
          </select>
        </label>

        <label className="site-field">
          <span>Врач</span>
          <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
            {clinic.doctors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.specialty}
              </option>
            ))}
          </select>
        </label>

        <label className="site-field">
          <span>Дата</span>
          <input
            type="date"
            value={date}
            min={toDateInput(new Date())}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>

      <div className="site-slots">
        <div className="site-slots-head">
          <span>Свободное время</span>
          <em>{dayInfo?.dayLabel ?? ''}</em>
        </div>

        {loadingSlots ? (
          <div className="site-skeleton" style={{ height: 44 }} />
        ) : dayInfo && !dayInfo.workingDay ? (
          <p className="site-muted">В этот день врач не принимает — выберите другую дату.</p>
        ) : slots.length ? (
          <div className="site-slot-grid">
            {slots.map((item) => (
              <button
                key={item.start}
                className={`site-slot ${slot?.start === item.start ? 'active' : ''}`}
                onClick={() => setSlot(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="site-muted">Свободных окон нет. Попробуйте другую дату или позвоните нам.</p>
        )}
      </div>

      <div className="site-booking-grid">
        <label className="site-field">
          <span>Имя и фамилия</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Мадина Тасуева" />
        </label>
        <label className="site-field">
          <span>Телефон</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 900 000-00-00"
            inputMode="tel"
          />
        </label>
        <label className="site-field site-field-wide">
          <span>Комментарий (необязательно)</span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Например: болит зуб справа, нужен срочный приём"
          />
        </label>
      </div>

      {error && <div className="site-alert">{error}</div>}

      <div className="site-booking-foot">
        <div className="site-booking-summary">
          {doctor && slot ? (
            <>
              <b>{doctor.name}</b>
              <span>
                {service} · {dayInfo?.dayLabel} в {formatTime(slot.start)}
              </span>
            </>
          ) : (
            <span>Выберите время — покажем итог записи</span>
          )}
        </div>
        <button className="site-btn site-btn-primary site-btn-lg" disabled={busy || !slot} onClick={() => void submit()}>
          {busy ? 'Записываем…' : 'Записаться'}
        </button>
      </div>

      <p className="site-consent">
        Нажимая «Записаться», вы соглашаетесь на обработку персональных данных для записи на приём.
      </p>
    </div>
  )
}

export type { PublicDoctor }
