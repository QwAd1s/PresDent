import type { Appointment, Channel, Doctor, Lead, Review, SeriesPoint } from './types'
import { freeSlots, onlyDay, sameDay, weekdayNumber } from './slots'

/**
 * Метрики, которые считаются из реальных данных, а не хранятся в справочнике:
 * поток заявок по дням, загрузка врача на сегодня, рейтинг из отзывов,
 * ближайшее свободное окно.
 */

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Заявки по дням и каналам за последние N дней (сегодня — последний). */
export function buildSeries(leads: Lead[], days = 7): SeriesPoint[] {
  const result: SeriesPoint[] = []

  for (let shift = days - 1; shift >= 0; shift -= 1) {
    const date = new Date()
    date.setDate(date.getDate() - shift)
    const key = dayKey(date)
    const ofDay = leads.filter((lead) => dayKey(new Date(lead.createdAt)) === key)
    const count = (channel: Channel) => ofDay.filter((lead) => lead.channel === channel).length

    result.push({
      date: key,
      whatsapp: count('whatsapp'),
      instagram: count('instagram'),
      site: count('site'),
      phone: count('phone'),
    })
  }

  return result
}

/** Ближайшее свободное окно врача в течение двух недель. */
export function nextFreeSlot(doctor: Doctor, appointments: Appointment[]): string {
  const today = onlyDay(new Date())

  for (let shift = 0; shift < 14; shift += 1) {
    const date = new Date(today)
    date.setDate(date.getDate() + shift)
    if (!doctor.workingDays.includes(weekdayNumber(date))) continue

    const slots = freeSlots(doctor, date, 30, appointments, 'Консультация', undefined, {
      limit: 1,
      earliest: new Date(),
    })
    if (slots.length) return slots[0].start
  }

  return ''
}

export interface DoctorMetrics {
  rating: number
  reviewsCount: number
  todayAppointments: number
  loadPercent: number
  nextSlot: string
}

export function doctorMetrics(
  doctor: Doctor,
  appointments: Appointment[],
  reviews: Review[],
  today = new Date(),
): DoctorMetrics {
  const own = reviews.filter((review) => review.doctorId === doctor.id)
  const rating = own.length
    ? Math.round((own.reduce((sum, review) => sum + review.rating, 0) / own.length) * 10) / 10
    : 0

  const todays = appointments.filter(
    (appointment) =>
      appointment.doctorId === doctor.id &&
      appointment.status !== 'cancelled' &&
      sameDay(new Date(appointment.start), today),
  )

  // 8 приёмов в день считаем полной загрузкой
  const loadPercent = Math.min(100, Math.round((todays.length / 8) * 100))

  return {
    rating,
    reviewsCount: own.length,
    todayAppointments: todays.length,
    loadPercent,
    nextSlot: nextFreeSlot(doctor, appointments),
  }
}

export const applyDoctorMetrics = (
  doctor: Doctor,
  appointments: Appointment[],
  reviews: Review[],
): Doctor => ({ ...doctor, ...doctorMetrics(doctor, appointments, reviews) })
