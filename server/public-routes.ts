import express from 'express'
import type { Appointment, Lead, Patient } from '../shared/types'
import { SERVICES, findService } from '../shared/services'
import { availableSlots, dateWithWeekday } from '../shared/slots'
import { patientAssistantReply } from '../shared/patient-assistant'
import { addEvent, getDb, newId, saveDb } from './store'
import { recordAudit } from './audit'
import { broadcast } from './realtime'

/**
 * Публичная часть: сайт клиники и онлайн-запись пациента.
 * Без авторизации, но с валидацией, проверкой занятости и лимитом заявок с одного IP.
 */

export const publicRouter = express.Router()

const RATE_WINDOW_MS = 60 * 60_000
const MAX_BOOKINGS = 8
const bookings = new Map<string, number[]>()

function hitLimit(ip: string): boolean {
  const now = Date.now()
  const attempts = (bookings.get(ip) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
  bookings.set(ip, attempts)

  if (attempts.length >= MAX_BOOKINGS) return true
  attempts.push(now)
  return false
}

const digits = (value: string) => String(value).replace(/\D/g, '')

/** Всё, что нужно лендингу: клиника, услуги, врачи, цифры доверия. */
publicRouter.get('/clinic', (_req, res) => {
  const db = getDb()
  const ratings = db.reviews.map((review) => review.rating)
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
    : 0

  res.json({
    settings: {
      name: db.settings.name,
      address: db.settings.address,
      phone: db.settings.phone,
      email: db.settings.email,
      workHours: db.settings.workHours,
    },
    services: SERVICES,
    doctors: db.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      color: doctor.color,
      rating: doctor.rating,
      reviewsCount: doctor.reviewsCount,
      experienceYears: doctor.experienceYears,
      workingDays: doctor.workingDays,
    })),
    trust: {
      doctors: db.doctors.length,
      reviews: db.reviews.length,
      rating: averageRating,
      patients: db.patients.length,
    },
  })
})

/** Свободные окна конкретного врача — без служебных подписей и пациентов. */
publicRouter.get('/slots', (req, res) => {
  const db = getDb()
  const { doctorId, date, service } = req.query as Record<string, string | undefined>

  const doctor = db.doctors.find((item) => item.id === doctorId)
  if (!doctor) {
    res.status(404).json({ error: 'Врач не найден' })
    return
  }

  const parsed = date ? new Date(`${date}T00:00:00`) : new Date()
  if (Number.isNaN(parsed.getTime())) {
    res.status(400).json({ error: 'Некорректная дата' })
    return
  }

  const chosen = findService(service)
  const durationMin = chosen?.durationMin ?? 30
  const result = availableSlots(doctor, parsed, db.appointments, durationMin, chosen?.title ?? 'Консультация', 10)

  res.json({
    items: result.slots.map((slot) => ({ start: slot.start, label: slot.label })),
    workingDay: result.workingDay,
    dayLabel: dateWithWeekday(parsed.toISOString()),
  })
})

/** ИИ-помощник пациента: только открытые данные, без заявок и истории. */
const botHits = new Map<string, number[]>()

publicRouter.post('/assistant', (req, res) => {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const hits = (botHits.get(ip) ?? []).filter((at) => now - at < 60 * 60_000)
  if (hits.length >= 80) {
    res.status(429).json({ error: 'Слишком много вопросов подряд. Позвоните нам — ответим голосом.' })
    return
  }
  hits.push(now)
  botHits.set(ip, hits)

  const text = String(req.body?.text ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Задайте вопрос' })
    return
  }
  if (text.length > 600) {
    res.status(400).json({ error: 'Слишком длинный вопрос — напишите короче' })
    return
  }

  const db = getDb()
  const reply = patientAssistantReply({
    text,
    data: { settings: db.settings, doctors: db.doctors, appointments: db.appointments },
  })

  res.json(reply)
})

/** Онлайн-запись: занимаем слот, создаём пациента (если новый) и заявку администратору. */
publicRouter.post('/book', (req, res) => {
  const ip = req.ip ?? 'unknown'
  if (hitLimit(ip)) {
    res.status(429).json({ error: 'Слишком много заявок подряд. Позвоните нам — запишем по телефону.' })
    return
  }

  const db = getDb()
  const name = String(req.body?.name ?? '').trim()
  const phone = String(req.body?.phone ?? '').trim()
  const serviceTitle = String(req.body?.service ?? '').trim()
  const doctorId = String(req.body?.doctorId ?? '').trim()
  const start = new Date(String(req.body?.start ?? ''))
  const comment = String(req.body?.comment ?? '').trim().slice(0, 500)

  if (name.length < 2) {
    res.status(400).json({ error: 'Укажите имя' })
    return
  }
  if (digits(phone).length < 10) {
    res.status(400).json({ error: 'Укажите телефон в формате +7 900 000-00-00' })
    return
  }

  const service = findService(serviceTitle)
  if (!service) {
    res.status(400).json({ error: 'Выберите услугу' })
    return
  }

  const doctor = db.doctors.find((item) => item.id === doctorId)
  if (!doctor) {
    res.status(400).json({ error: 'Выберите врача' })
    return
  }

  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    res.status(400).json({ error: 'Выберите свободное время' })
    return
  }

  const endMs = start.getTime() + service.durationMin * 60_000
  const conflict = db.appointments.find((appointment) => {
    if (appointment.doctorId !== doctorId) return false
    if (appointment.status === 'cancelled') return false
    const otherStart = new Date(appointment.start).getTime()
    return start.getTime() < otherStart + appointment.durationMin * 60_000 && otherStart < endMs
  })

  if (conflict) {
    res.status(409).json({ error: 'Это время только что заняли. Выберите другое окно.' })
    return
  }

  const patient = db.patients.find((item) => digits(item.phone) === digits(phone))
  if (!patient) {
    const created: Patient = {
      id: newId('pat'),
      name,
      phone,
      since: new Date().toISOString(),
      visits: 0,
      lastVisit: start.toISOString(),
      totalSpent: 0,
      tags: ['Онлайн-запись'],
      channel: 'site',
    }
    db.patients.push(created)
  }

  const appointment: Appointment = {
    id: newId('ap'),
    patientName: name,
    phone,
    doctorId,
    service: service.title,
    start: start.toISOString(),
    durationMin: service.durationMin,
    status: 'confirmed',
    channel: 'site',
    note: comment || undefined,
    createdAt: new Date().toISOString(),
  }
  db.appointments.push(appointment)

  const lead: Lead = {
    id: newId('lead'),
    channel: 'site',
    name,
    phone,
    service: service.title,
    status: 'booked',
    priority: 'normal',
    unread: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: newId('m'),
        direction: 'in',
        text:
          `Онлайн-запись с сайта: ${service.title}, ${dateWithWeekday(start.toISOString())} в ` +
          `${new Date(start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}, врач ${doctor.name}.` +
          (comment ? ` Комментарий: ${comment}` : ''),
        at: new Date().toISOString(),
      },
    ],
  }
  db.leads.unshift(lead)

  saveDb()
  addEvent({ channel: 'site', kind: 'incoming', text: `Онлайн-запись: ${name} · ${service.title}` })
  broadcast('lead:new', lead)
  broadcast('appointment:new', appointment)
  recordAudit({
    user: { id: 'public-site', name: 'Сайт клиники' },
    action: 'appointment.create',
    entity: 'appointment',
    entityId: appointment.id,
    details: `Онлайн-запись: ${name} · ${service.title} · ${start.toLocaleString('ru-RU')}`,
  })

  res.status(201).json({
    appointmentId: appointment.id,
    start: appointment.start,
    doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty },
    service: { title: service.title, price: service.price, durationMin: service.durationMin },
  })
})
