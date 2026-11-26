import type { Appointment, Reminder } from '../shared/types'
import { addEvent, getDb, newId, saveDb } from './store'
import { deliver } from './delivery'

/**
 * Напоминания пациентам.
 *
 * planReminders()  — идемпотентно создаёт задачи: напоминание о приёме
 *                    (за N часов) и запрос отзыва (через M часов после визита).
 * processDue()     — отправляет то, что уже пора, через доступный канал.
 * startReminderScheduler() — раз в минуту делает и то, и другое.
 */

const DAY_MS = 24 * 60 * 60_000
const MAX_ATTEMPTS = 3
const FUTURE_WINDOW_MS = 72 * 60 * 60_000
const PAST_WINDOW_MS = 14 * DAY_MS

const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

function appointmentText(appointment: Appointment, doctorName: string, address: string): string {
  return (
    `Здравствуйте, ${appointment.patientName.split(' ')[0]}! Напоминаем: ` +
    `${whenLabel(appointment.start)} у вас приём в стоматологии PresiDent — ` +
    `${appointment.service}, врач ${doctorName}. Адрес: ${address}. ` +
    'Если планы изменились, ответьте на это сообщение — перенесём.'
  )
}

function reviewText(appointment: Appointment): string {
  return (
    `${appointment.patientName.split(' ')[0]}, спасибо, что были в PresiDent! ` +
    `Оцените, пожалуйста, приём по шкале от 1 до 5 — это помогает нам становиться лучше. ` +
    'Ответьте одним числом, мы всё поймём.'
  )
}

const hasReminder = (appointmentId: string, kind: Reminder['kind']) =>
  getDb().reminders.some(
    (reminder) =>
      reminder.appointmentId === appointmentId && reminder.kind === kind && reminder.status !== 'skipped',
  )

const canNotify = (phone: string) => phone.replace(/\D/g, '').length >= 10

/** Создаёт недостающие напоминания. Возвращает, сколько добавили. */
export function planReminders(): { created: number; due: number } {
  const db = getDb()
  const now = Date.now()
  const leadHours = db.settings.reminderHours ?? 24
  const reviewHours = db.settings.reviewDelayHours ?? 2
  const address = db.settings.address

  let created = 0

  for (const appointment of db.appointments) {
    if (!canNotify(appointment.phone)) continue

    const start = new Date(appointment.start).getTime()
    const doctor = db.doctors.find((item) => item.id === appointment.doctorId)
    const doctorName = doctor?.name ?? 'врач клиники'

    // Напоминание о будущем приёме
    if (appointment.status !== 'cancelled' && start > now && start - now <= FUTURE_WINDOW_MS) {
      if (!hasReminder(appointment.id, 'appointment')) {
        const sendAt = Math.max(start - leadHours * 60 * 60_000, now)
        db.reminders.push({
          id: newId('rem'),
          kind: 'appointment',
          appointmentId: appointment.id,
          patientName: appointment.patientName,
          phone: appointment.phone,
          channel: 'whatsapp',
          text: appointmentText(appointment, doctorName, address),
          sendAt: new Date(sendAt).toISOString(),
          status: 'pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
        })
        created += 1
      }
    }

    // Запрос отзыва после визита
    if (appointment.status !== 'cancelled' && start < now && now - start <= PAST_WINDOW_MS) {
      if (!hasReminder(appointment.id, 'review')) {
        const sendAt = start + reviewHours * 60 * 60_000
        db.reminders.push({
          id: newId('rem'),
          kind: 'review',
          appointmentId: appointment.id,
          patientName: appointment.patientName,
          phone: appointment.phone,
          channel: 'whatsapp',
          text: reviewText(appointment),
          sendAt: new Date(sendAt).toISOString(),
          status: 'pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
        })
        created += 1
      }
    }
  }

  if (created > 0) saveDb()

  const due = db.reminders.filter(
    (reminder) => reminder.status === 'pending' && new Date(reminder.sendAt).getTime() <= now,
  ).length

  return { created, due }
}

let processing = false

/** Отправляет все просроченные напоминания. */
export async function processDue(limit = 25): Promise<{ sent: number; dryRun: number; failed: number }> {
  if (processing) return { sent: 0, dryRun: 0, failed: 0 }
  processing = true

  const db = getDb()
  const now = Date.now()
  const due = db.reminders
    .filter((reminder) => reminder.status === 'pending' && new Date(reminder.sendAt).getTime() <= now)
    .slice(0, limit)

  let sent = 0
  let dryRun = 0
  let failed = 0

  try {
    for (const reminder of due) {
      const result = await deliver({ channel: reminder.channel, to: reminder.phone, text: reminder.text })
      reminder.attempts += 1

      if (!result.ok) {
        reminder.error = result.error
        if (reminder.attempts >= MAX_ATTEMPTS) {
          reminder.status = 'failed'
          addEvent({
            channel: 'site',
            kind: 'error',
            text: `Напоминание не доставлено (${reminder.patientName}): ${result.error ?? 'ошибка'}`,
          })
        } else {
          // повтор через 10 минут
          reminder.sendAt = new Date(now + 10 * 60_000).toISOString()
        }
        failed += 1
        continue
      }

      reminder.status = result.provider === 'live' ? 'sent' : 'dry_run'
      reminder.sentAt = new Date().toISOString()
      reminder.error = undefined

      if (result.provider === 'live') sent += 1
      else dryRun += 1
    }

    if (due.length > 0) saveDb()
  } finally {
    processing = false
  }

  return { sent, dryRun, failed }
}

export function reminderStats() {
  const db = getDb()
  const now = Date.now()
  const count = (status: Reminder['status']) => db.reminders.filter((item) => item.status === status).length

  return {
    total: db.reminders.length,
    pending: count('pending'),
    sent: count('sent'),
    dryRun: count('dry_run'),
    failed: count('failed'),
    dueNow: db.reminders.filter(
      (item) => item.status === 'pending' && new Date(item.sendAt).getTime() <= now,
    ).length,
  }
}

let timer: NodeJS.Timeout | null = null

export function startReminderScheduler(intervalMs: number): void {
  if (timer) return

  const tick = async () => {
    try {
      planReminders()
      const result = await processDue()
      if (result.sent || result.dryRun || result.failed) {
        console.log(
          `[reminders] отправлено ${result.sent}, демо ${result.dryRun}, ошибок ${result.failed}`,
        )
      }
    } catch (error) {
      console.error('[reminders] ошибка планировщика:', error)
    }
  }

  void tick()
  timer = setInterval(() => void tick(), intervalMs)
  console.log(`[reminders] планировщик запущен, интервал ${Math.round(intervalMs / 1000)} с`)
}

export function stopReminderScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
