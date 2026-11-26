import type { Appointment, Doctor } from './types'

/**
 * Расчёт свободных окон — общий для ИИ-админа, формы записи и кабинета пациента.
 * Ничего не знает про Express и React: на вход расписание, на выходе слоты.
 */

export interface SlotOffer {
  id: string
  start: string
  label: string
  doctorId: string
  doctorName: string
  service: string
  durationMin: number
  patientName?: string
}

export const SLOT_STEP_MIN = 30
export const MAX_SLOTS = 6

export const onlyDay = (date: Date): Date => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/** 1 = понедельник … 7 = воскресенье */
export const weekdayNumber = (date: Date): number => (date.getDay() === 0 ? 7 : date.getDay())

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export const formatRuDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

export const weekdayOf = (iso: string): string =>
  new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long' })

/** «27 ноября (пятница)» — без падежных ловушек */
export const dateWithWeekday = (iso: string): string => `${formatRuDate(iso)} (${weekdayOf(iso)})`

/** Рабочее окно клиники: будни 9–21, воскресенье 10–18 */
export function workingWindow(date: Date): { open: number; close: number } {
  return date.getDay() === 0 ? { open: 10, close: 18 } : { open: 9, close: 21 }
}

export function overlaps(startA: Date, minutesA: number, startB: Date, minutesB: number): boolean {
  const endA = startA.getTime() + minutesA * 60_000
  const endB = startB.getTime() + minutesB * 60_000
  return startA.getTime() < endB && startB.getTime() < endA
}

export interface SlotOptions {
  /** С какого момента показывать окна (по умолчанию «сейчас + 1 час») */
  earliest?: Date
  limit?: number
  /** Не учитывать этот приём (для переноса) */
  excludeAppointmentId?: string
}

export function freeSlots(
  doctor: Doctor,
  date: Date,
  durationMin: number,
  appointments: Appointment[],
  service: string,
  patientName?: string,
  options: SlotOptions = {},
): SlotOffer[] {
  const { open, close } = workingWindow(date)
  const limit = options.limit ?? MAX_SLOTS
  const earliest = options.earliest ?? new Date(Date.now() + 60 * 60_000)

  const busy = appointments
    .filter(
      (appointment) =>
        appointment.doctorId === doctor.id &&
        appointment.status !== 'cancelled' &&
        appointment.id !== options.excludeAppointmentId &&
        sameDay(new Date(appointment.start), date),
    )
    .map((appointment) => ({
      start: new Date(appointment.start),
      minutes: appointment.durationMin,
    }))

  const offers: SlotOffer[] = []

  for (let minutes = open * 60; minutes + durationMin <= close * 60; minutes += SLOT_STEP_MIN) {
    if (offers.length >= limit) break

    const candidate = new Date(date)
    candidate.setHours(0, minutes, 0, 0)

    if (candidate.getTime() < earliest.getTime()) continue
    if (busy.some((item) => overlaps(candidate, durationMin, item.start, item.minutes))) continue

    offers.push({
      id: `${doctor.id}-${candidate.toISOString()}`,
      start: candidate.toISOString(),
      label: formatTime(candidate.toISOString()),
      doctorId: doctor.id,
      doctorName: doctor.name,
      service,
      durationMin,
      patientName,
    })
  }

  return offers
}

export function nextWorkingDay(doctor: Doctor, from: Date): Date {
  const date = onlyDay(from)
  for (let shift = 1; shift <= 7; shift += 1) {
    date.setDate(date.getDate() + 1)
    if (doctor.workingDays.includes(weekdayNumber(date))) return new Date(date)
  }
  return date
}

/** Удобная обёртка для API: окна конкретного врача на день. */
export function availableSlots(
  doctor: Doctor,
  date: Date,
  appointments: Appointment[],
  durationMin: number,
  service: string,
  limit = 12,
): { slots: SlotOffer[]; workingDay: boolean } {
  const workingDay = doctor.workingDays.includes(weekdayNumber(date))

  return {
    workingDay,
    slots: freeSlots(doctor, date, durationMin, appointments, service, undefined, {
      limit,
      earliest: new Date(Date.now() + 15 * 60_000),
    }),
  }
}
