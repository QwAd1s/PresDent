import express from 'express'
import { randomBytes } from 'node:crypto'
import type { Appointment, Lead, LeadsResponse, LeadStatus, Stats, StoredUser, UserRole } from '../shared/types'
import { channelStates, series as seedSeries } from '../shared/fixtures'
import { assistantReply, type AssistantPending } from '../shared/assistant'
import { availableSlots, dateWithWeekday } from '../shared/slots'
import { SERVICE_DURATION } from '../shared/services'
import { auditRequest, recordAudit } from './audit'
import { publicRouter } from './public-routes'
import { planReminders, processDue, reminderStats } from './reminders'
import { addEvent, getDb, newId, saveDb, storeInfo } from './store'
import { broadcast, addClient, clientsCount } from './realtime'
import { ingestIncoming } from './ingest'
import { sendReply, verifyMetaSignature } from './channels'
import { buildSampleMessage, parseInstagram, parseWhatsApp } from './webhooks'
import { config, isInstagramLive, isWhatsAppLive } from './config'
import {
  allow,
  authGate,
  clearCookieHeader,
  clearLoginFailures,
  createSession,
  destroySession,
  destroyUserSessions,
  loginBlocked,
  noteLoginFailure,
  publicUser,
  sessionCookieHeader,
  verifyPassword,
} from './auth'
import { hashPassword } from './password'

export const router = express.Router()

/** Всё, что ниже, требует активной сессии (кроме входа и вебхуков). */
router.use(authGate)

/** Публичный сайт клиники: без авторизации, но с лимитом заявок. */
router.use('/public', publicRouter)

/** Заявки, каналы, настройки — только для владельца и администратора. */
const staffOnly = allow('owner', 'admin')
const ownerOnly = allow('owner')
const anyRole = allow('owner', 'admin', 'doctor')

const ROLES: UserRole[] = ['owner', 'admin', 'doctor']

/** Временный пароль для приглашённого сотрудника. */
const generatePassword = () => randomBytes(12).toString('base64url').slice(0, 12)

const activeOwners = (users: StoredUser[]) => users.filter((user) => user.role === 'owner' && user.active !== false)

const localDay = (iso: string | Date) => new Date(iso).toLocaleDateString('sv-SE')
const today = () => localDay(new Date())
const percent = (value: number) => Math.round(value * 10) / 10

function averageResponseMinutes(leads: Lead[]): number {
  const diffs: number[] = []

  for (const lead of leads) {
    for (let i = 0; i < lead.messages.length; i += 1) {
      const inbound = lead.messages[i]
      if (inbound.direction !== 'in') continue
      const reply = lead.messages.slice(i + 1).find((m) => m.direction === 'out')
      if (!reply) continue
      diffs.push((new Date(reply.at).getTime() - new Date(inbound.at).getTime()) / 60_000)
      break
    }
  }

  if (!diffs.length) return 0
  return percent(diffs.reduce((sum, d) => sum + d, 0) / diffs.length)
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    storage: storeInfo(),
    dryRun: config.dryRun,
    whatsapp: isWhatsAppLive() ? 'live' : 'demo',
    instagram: isInstagramLive() ? 'live' : 'demo',
    sseClients: clientsCount(),
  })
})

// ─── Вход и доступы ─────────────────────────────────────────────────────────

router.post('/auth/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const key = `${req.ip}:${email}`

  if (!email || !password) {
    res.status(400).json({ error: 'Укажите e-mail и пароль' })
    return
  }

  if (loginBlocked(key)) {
    res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 10 минут.' })
    return
  }

  const db = getDb()
  const user = db.users.find((item) => item.email.toLowerCase() === email)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    noteLoginFailure(key)
    addEvent({ channel: 'site', kind: 'error', text: `Неудачный вход: ${email}` })
    res.status(401).json({ error: 'Неверный e-mail или пароль' })
    return
  }

  if (user.active === false) {
    addEvent({ channel: 'site', kind: 'error', text: `Отключённый доступ: ${email}` })
    res.status(403).json({ error: 'Доступ отключён. Обратитесь к владельцу клиники.' })
    return
  }

  clearLoginFailures(key)
  const session = createSession(user, req.header('user-agent'))

  res.setHeader('Set-Cookie', sessionCookieHeader(session.id))
  addEvent({ channel: 'site', kind: 'system', text: `Вход в систему: ${user.name} (${user.role})` })
  recordAudit({
    user: { id: user.id, name: user.name },
    action: 'auth.login',
    entity: 'auth',
    details: `Роль: ${user.role}`,
  })
  res.json({ user: publicUser(user) })
})

router.post('/auth/logout', (req, res) => {
  if (req.sessionId) destroySession(req.sessionId)
  if (req.user) {
    recordAudit({ user: req.user, action: 'auth.logout', entity: 'auth' })
  }
  res.setHeader('Set-Cookie', clearCookieHeader())
  res.json({ ok: true })
})

/** Завершить все остальные сессии сотрудника (смена устройства, утеря ноутбука). */
router.post('/auth/logout-others', anyRole, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Требуется вход' })
    return
  }

  const db = getDb()
  const before = db.sessions.length
  destroyUserSessions(req.user.id, req.sessionId)
  const ended = before - db.sessions.length

  recordAudit({ user: req.user, action: 'auth.logout_others', entity: 'auth', details: `Завершено сессий: ${ended}` })
  res.json({ ok: true, ended })
})

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user })
})

router.post('/auth/password', (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '')
  const newPassword = String(req.body?.newPassword ?? '')

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Новый пароль должен быть не короче 8 символов' })
    return
  }

  const db = getDb()
  const user = db.users.find((item) => item.id === req.user?.id)
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Текущий пароль неверен' })
    return
  }

  user.passwordHash = hashPassword(newPassword)
  destroyUserSessions(user.id, req.sessionId)
  saveDb()
  addEvent({ channel: 'site', kind: 'system', text: `Смена пароля: ${user.email}` })
  auditRequest(req, 'auth.password_change', 'auth', user.id, user.email)
  res.json({ ok: true })
})

router.get('/users', staffOnly, (_req, res) => {
  const db = getDb()
  res.json({
    items: db.users.map(publicUser),
    online: db.sessions
      .filter((session) => new Date(session.expiresAt).getTime() > Date.now())
      .map((session) => session.userId),
  })
})

/** Приглашение сотрудника. Пароль либо задаётся, либо генерируется и показывается один раз. */
router.post('/users', ownerOnly, (req, res) => {
  const db = getDb()
  const name = String(req.body?.name ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const role = req.body?.role as UserRole
  const doctorId = req.body?.doctorId ? String(req.body.doctorId) : undefined

  if (name.length < 2 || !email.includes('@')) {
    res.status(400).json({ error: 'Укажите имя и корректный e-mail' })
    return
  }
  if (!ROLES.includes(role)) {
    res.status(400).json({ error: 'Недопустимая роль' })
    return
  }
  if (role === 'doctor' && !doctorId) {
    res.status(400).json({ error: 'Для роли врача выберите врача из справочника' })
    return
  }
  if (db.users.some((user) => user.email.toLowerCase() === email)) {
    res.status(409).json({ error: 'Сотрудник с таким e-mail уже есть' })
    return
  }

  const rawPassword = String(req.body?.password ?? '')
  const password = rawPassword.length >= 8 ? rawPassword : generatePassword()

  const user: StoredUser = {
    id: newId('usr'),
    name,
    email,
    role,
    doctorId,
    active: true,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
  }

  db.users.push(user)
  saveDb()
  auditRequest(req, 'user.create', 'user', user.id, `${name} · ${role} · ${email}`)

  res.status(201).json({
    user: publicUser(user),
    temporaryPassword: rawPassword.length >= 8 ? undefined : password,
  })
})

/** Изменение профиля: имя, роль, активность, привязка к врачу. */
router.patch('/users/:id', ownerOnly, (req, res) => {
  const db = getDb()
  const user = db.users.find((item) => item.id === req.params.id)
  if (!user) {
    res.status(404).json({ error: 'Сотрудник не найден' })
    return
  }

  const { name, role, active, doctorId } = req.body ?? {}
  const isSelf = user.id === req.user?.id

  if (role && !ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: 'Недопустимая роль' })
    return
  }
  if (isSelf && role && role !== user.role) {
    res.status(400).json({ error: 'Нельзя менять свою роль' })
    return
  }
  if (isSelf && active === false) {
    res.status(400).json({ error: 'Нельзя отключить собственный доступ' })
    return
  }

  const wasOwner = user.role === 'owner' && user.active !== false
  const willBeOwner = (role ?? user.role) === 'owner' && (active ?? user.active) !== false
  if (wasOwner && !willBeOwner && activeOwners(db.users).length <= 1) {
    res.status(400).json({ error: 'В клинике должен остаться хотя бы один владелец' })
    return
  }

  const changes: string[] = []
  if (name && name !== user.name) {
    changes.push(`имя: ${user.name} → ${name}`)
    user.name = String(name).trim()
  }
  if (role && role !== user.role) {
    changes.push(`роль: ${user.role} → ${role}`)
    user.role = role as UserRole
    if (user.role !== 'doctor' && user.doctorId) {
      user.doctorId = undefined
      changes.push('привязка к врачу снята')
    }
  }
  if (doctorId !== undefined && doctorId !== user.doctorId) {
    user.doctorId = doctorId || undefined
    const doctorName = db.doctors.find((doctor) => doctor.id === user.doctorId)?.name
    changes.push(`врач: ${doctorName ?? '—'}`)
  }
  if (active !== undefined && active !== (user.active !== false)) {
    user.active = Boolean(active)
    changes.push(active ? 'доступ включён' : 'доступ отключён')
    if (!active) destroyUserSessions(user.id)
  }

  saveDb()
  auditRequest(req, 'user.update', 'user', user.id, changes.join('; ') || 'без изменений')
  res.json(publicUser(user))
})

/** Сброс пароля сотрудника: старый пароль не нужен, сессии отзываются. */
router.post('/users/:id/password', ownerOnly, (req, res) => {
  const db = getDb()
  const user = db.users.find((item) => item.id === req.params.id)
  if (!user) {
    res.status(404).json({ error: 'Сотрудник не найден' })
    return
  }

  const password = generatePassword()
  user.passwordHash = hashPassword(password)
  destroyUserSessions(user.id)
  saveDb()

  auditRequest(req, 'user.password_reset', 'user', user.id, `Пароль сброшен для ${user.email}`)
  res.json({ password })
})

/** Журнал действий с фильтрами. */router.get('/audit', staffOnly, (req, res) => {
  const db = getDb()
  const { entity, q, limit } = req.query as Record<string, string | undefined>
  const search = q?.trim().toLowerCase()

  let items = db.audit ?? []
  if (entity && entity !== 'all') items = items.filter((record) => record.entity === entity)
  if (search) {
    items = items.filter((record) =>
      [record.userName, record.action, record.details, record.entityId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }

  const max = Math.min(Number(limit) || 100, 400)
  res.json({ items: items.slice(0, max), total: items.length })
})

// ─── Напоминания ────────────────────────────────────────────────────────────

router.get('/reminders', staffOnly, (req, res) => {
  const db = getDb()
  const { status } = req.query as { status?: string }

  const items = [...db.reminders]
    .filter((reminder) => !status || status === 'all' || reminder.status === status)
    .sort((a, b) => +new Date(a.sendAt) - +new Date(b.sendAt))
    .slice(0, 200)

  res.json({ items, stats: reminderStats() })
})

/** Кнопка «Разослать сейчас»: планирует недостающие и отправляет просроченные. */
router.post('/reminders/run', staffOnly, async (req, res) => {
  const planned = planReminders()
  const result = await processDue()

  auditRequest(
    req,
    'reminders.run',
    'reminder',
    undefined,
    `создано ${planned.created}, отправлено ${result.sent}, демо ${result.dryRun}, ошибок ${result.failed}`,
  )

  res.json({ planned, ...result, stats: reminderStats() })
})

router.post('/reminders/:id/skip', staffOnly, (req, res) => {
  const db = getDb()
  const reminder = db.reminders.find((item) => item.id === req.params.id)
  if (!reminder) {
    res.status(404).json({ error: 'Напоминание не найдено' })
    return
  }

  reminder.status = 'skipped'
  saveDb()
  auditRequest(req, 'reminder.skip', 'reminder', reminder.id, `${reminder.patientName} · ${reminder.kind}`)
  res.json(reminder)
})

// ─── Статистика для дашборда ────────────────────────────────────────────────

router.get('/stats', (_req, res) => {
  const db = getDb()
  const now = new Date()
  const dayStartLeads = db.leads.filter((lead) => localDay(lead.createdAt) === today())

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = localDay(yesterday)
  const yesterdayLeads = db.leads.filter((lead) => localDay(lead.createdAt) === yesterdayKey)

  const appointmentsToday = db.appointments.filter((a) => localDay(a.start) === today())
  const appointmentsYesterday = db.appointments.filter((a) => localDay(a.start) === yesterdayKey)

  const converted = db.leads.filter((lead) => lead.status === 'booked' || lead.status === 'closed').length
  const conversion = db.leads.length ? percent((converted / db.leads.length) * 100) : 0

  const series = seedSeries.map((point) => {
    if (point.date !== today()) return point
    const count = (channel: 'whatsapp' | 'instagram' | 'site' | 'phone') =>
      dayStartLeads.filter((lead) => lead.channel === channel).length
    return {
      date: point.date,
      whatsapp: count('whatsapp'),
      instagram: count('instagram'),
      site: count('site'),
      phone: count('phone'),
    }
  })

  const byChannel = (['whatsapp', 'instagram', 'site', 'phone'] as const).map((channel) => ({
    channel,
    count: db.leads.filter((lead) => lead.channel === channel).length,
  }))

  const avgResponseMin = averageResponseMinutes(db.leads)

  const stats: Stats = {
    newLeads: dayStartLeads.length,
    newLeadsDelta: yesterdayLeads.length
      ? percent(((dayStartLeads.length - yesterdayLeads.length) / yesterdayLeads.length) * 100)
      : 0,
    appointmentsToday: appointmentsToday.length,
    appointmentsDelta: appointmentsToday.length - appointmentsYesterday.length,
    conversion,
    conversionDelta: 2.4,
    avgResponseMin,
    avgResponseDelta: -1.4,
    series,
    byChannel,
    doctorsLoad: db.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      color: doctor.color,
      loadPercent: doctor.loadPercent,
      todayAppointments: doctor.todayAppointments,
    })),
    recentReviews: [...db.reviews].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 3),
    totalLeads: db.leads.length,
  }

  res.json(stats)
})

// ─── Заявки ─────────────────────────────────────────────────────────────────

router.get('/leads', staffOnly, (req, res) => {
  const db = getDb()
  const { status, channel, q } = req.query as Record<string, string | undefined>
  const search = q?.trim().toLowerCase()

  // «all» — это отсутствие фильтра, а не имя канала
  const channelFilter = channel && channel !== 'all' ? channel : null
  const statusFilter = status && status !== 'all' ? status : null

  const matchesSearch = (lead: Lead) => {
    if (!search) return true
    return [lead.name, lead.phone, lead.handle, lead.service, lead.messages.at(-1)?.text]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search))
  }

  const base = db.leads.filter(
    (lead) => (!channelFilter || lead.channel === channelFilter) && matchesSearch(lead),
  )

  const counts = base.reduce(
    (acc, lead) => {
      acc[lead.status] += 1
      acc.all += 1
      return acc
    },
    { new: 0, in_progress: 0, booked: 0, closed: 0, spam: 0, all: 0 } as LeadsResponse['counts'],
  )

  const items = base
    .filter((lead) => !statusFilter || lead.status === statusFilter)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  const payload: LeadsResponse = { items, counts }
  res.json(payload)
})

router.get('/leads/:id', staffOnly, (req, res) => {
  const lead = getDb().leads.find((item) => item.id === req.params.id)
  if (!lead) {
    res.status(404).json({ error: 'Заявка не найдена' })
    return
  }
  res.json(lead)
})

router.patch('/leads/:id', staffOnly, (req, res) => {
  const db = getDb()
  const lead = db.leads.find((item) => item.id === req.params.id)
  if (!lead) {
    res.status(404).json({ error: 'Заявка не найдена' })
    return
  }

  const { status, priority, assignee, note, service } = req.body ?? {}
  const previousStatus = lead.status
  if (status) lead.status = status as LeadStatus
  if (priority) lead.priority = priority
  if (assignee !== undefined) lead.assignee = assignee
  if (note !== undefined) lead.note = note
  if (service !== undefined) lead.service = service
  lead.unread = 0
  lead.updatedAt = new Date().toISOString()

  saveDb()
  if (status && status !== previousStatus) {
    auditRequest(req, 'lead.status', 'lead', lead.id, `${previousStatus} → ${status}`)
  } else {
    auditRequest(req, 'lead.update', 'lead', lead.id, lead.name)
  }
  broadcast('lead:update', lead)
  res.json(lead)
})

router.post('/leads', staffOnly, (req, res) => {
  const { name, phone, service, text, channel } = req.body ?? {}
  if (!name || !phone) {
    res.status(400).json({ error: 'Укажите имя и телефон' })
    return
  }

  const { lead } = ingestIncoming({
    channel: channel ?? 'phone',
    externalUserId: phone,
    name,
    phone,
    text: text ?? 'Заявка, созданная администратором',
    service,
    at: new Date().toISOString(),
  })

  auditRequest(req, 'lead.create', 'lead', lead.id, `${lead.name} · ${lead.channel}`)
  res.status(201).json(lead)
})

router.post('/leads/:id/messages', staffOnly, async (req, res) => {
  const db = getDb()
  const lead = db.leads.find((item) => item.id === req.params.id)
  if (!lead) {
    res.status(404).json({ error: 'Заявка не найдена' })
    return
  }

  const text = String(req.body?.text ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Пустое сообщение' })
    return
  }

  const message = await sendReply(lead, text)
  lead.messages.push(message)
  lead.unread = 0
  lead.updatedAt = message.at
  if (lead.status === 'new') lead.status = 'in_progress'

  saveDb()
  broadcast('lead:message', { leadId: lead.id, message })
  auditRequest(req, 'lead.message', 'lead', lead.id, `${lead.name} · ${lead.channel}`)
  res.status(201).json({ message, lead })
})

// ─── Пациенты, врачи, отзывы, расписание ────────────────────────────────────

router.get('/patients', (req, res) => {
  const db = getDb()
  const { q } = req.query as { q?: string }
  const search = q?.trim().toLowerCase()
  const items = db.patients
    .filter((patient) =>
      !search
        ? true
        : [patient.name, patient.phone, patient.notes, ...patient.tags]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search)),
    )
    .sort((a, b) => +new Date(b.lastVisit) - +new Date(a.lastVisit))

  res.json({ items, total: db.patients.length })
})

router.get('/doctors', (_req, res) => {
  res.json({ items: getDb().doctors })
})

router.get('/reviews', (_req, res) => {
  const db = getDb()
  const items = [...db.reviews].sort((a, b) => +new Date(b.at) - +new Date(a.at))
  const average = items.length
    ? percent(items.reduce((sum, review) => sum + review.rating, 0) / items.length)
    : 0
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: items.filter((review) => review.rating === rating).length,
  }))
  res.json({ items, average, distribution, unanswered: items.filter((r) => !r.answered).length })
})

router.post('/reviews/:id/reply', staffOnly, (req, res) => {
  const db = getDb()
  const review = db.reviews.find((item) => item.id === req.params.id)
  if (!review) {
    res.status(404).json({ error: 'Отзыв не найден' })
    return
  }
  const reply = String(req.body?.reply ?? '').trim()
  if (!reply) {
    res.status(400).json({ error: 'Пустой ответ' })
    return
  }
  review.reply = reply
  review.answered = true
  saveDb()
  auditRequest(req, 'review.reply', 'review', review.id, `${review.author} · ${review.rating}★`)
  res.json(review)
})

router.get('/appointments', (_req, res) => {
  res.json({ items: getDb().appointments })
})

/** Свободные окна врача на день — для формы записи и переноса. */
router.get('/slots', anyRole, (req, res) => {
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

  const durationMin = service ? (SERVICE_DURATION[service] ?? 60) : 60
  const result = availableSlots(doctor, parsed, db.appointments, durationMin, service ?? 'Консультация', 16)

  res.json({
    items: result.slots,
    workingDay: result.workingDay,
    dayLabel: dateWithWeekday(parsed.toISOString()),
  })
})

/** Смена статуса приёма: подтвердить, отметить приход, завершить, отменить. */
router.patch('/appointments/:id', anyRole, (req, res) => {
  const db = getDb()
  const appointment = db.appointments.find((item) => item.id === req.params.id)
  if (!appointment) {
    res.status(404).json({ error: 'Запись не найдена' })
    return
  }

  const { status, note, cancelledReason } = req.body ?? {}
  const allowed: Appointment['status'][] = ['confirmed', 'waiting', 'done', 'cancelled']
  if (status && !allowed.includes(status)) {
    res.status(400).json({ error: 'Недопустимый статус' })
    return
  }

  if (status) appointment.status = status
  if (note !== undefined) appointment.note = note
  if (cancelledReason !== undefined) appointment.cancelledReason = cancelledReason

  // отменили приём — снимаем с очереди его напоминания
  if (status === 'cancelled') {
    for (const reminder of db.reminders) {
      if (reminder.appointmentId === appointment.id && reminder.status === 'pending') {
        reminder.status = 'skipped'
        reminder.error = 'Приём отменён'
      }
    }
  }

  saveDb()
  broadcast('appointment:update', appointment)
  auditRequest(
    req,
    status === 'cancelled' ? 'appointment.cancel' : 'appointment.status',
    'appointment',
    appointment.id,
    `${appointment.patientName} · ${status ?? 'без статуса'}`,
  )
  res.json(appointment)
})

/** Перенос приёма с повторной проверкой занятости. */
router.post('/appointments/:id/reschedule', anyRole, (req, res) => {
  const db = getDb()
  const appointment = db.appointments.find((item) => item.id === req.params.id)
  if (!appointment) {
    res.status(404).json({ error: 'Запись не найдена' })
    return
  }

  const start = new Date(String(req.body?.start ?? ''))
  if (Number.isNaN(start.getTime())) {
    res.status(400).json({ error: 'Некорректное время' })
    return
  }

  const endMs = start.getTime() + appointment.durationMin * 60_000
  const conflict = db.appointments.find((other) => {
    if (other.id === appointment.id) return false
    if (other.doctorId !== appointment.doctorId) return false
    if (other.status === 'cancelled') return false
    const otherStart = new Date(other.start).getTime()
    const otherEnd = otherStart + other.durationMin * 60_000
    return start.getTime() < otherEnd && otherStart < endMs
  })

  if (conflict) {
    res.status(409).json({ error: 'Это время уже занято', conflict: { start: conflict.start } })
    return
  }

  const previous = appointment.start
  appointment.start = start.toISOString()
  appointment.status = 'confirmed'
  appointment.note = `${appointment.note ? `${appointment.note} ` : ''}Перенос с ${new Date(previous).toLocaleString('ru-RU')}`

  saveDb()
  broadcast('appointment:update', appointment)
  auditRequest(
    req,
    'appointment.reschedule',
    'appointment',
    appointment.id,
    `${appointment.patientName}: ${new Date(previous).toLocaleString('ru-RU')} → ${start.toLocaleString('ru-RU')}`,
  )
  res.json(appointment)
})

/**
 * Запись на приём — вызывается из «ИИ-админа» и из ручной формы.
 * Проверяем, что врач существует и что время не занято.
 */
router.post('/appointments', anyRole, (req, res) => {
  const db = getDb()
  const { patientName, phone, doctorId, service, start, durationMin, channel } = req.body ?? {}

  if (!patientName || !doctorId || !start) {
    res.status(400).json({ error: 'Нужны имя пациента, врач и время' })
    return
  }

  const doctor = db.doctors.find((item) => item.id === doctorId)
  if (!doctor) {
    res.status(404).json({ error: 'Врач не найден' })
    return
  }

  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) {
    res.status(400).json({ error: 'Некорректное время' })
    return
  }

  const duration = Number(durationMin) || 30
  const endMs = startDate.getTime() + duration * 60_000
  const conflict = db.appointments.find((appointment) => {
    const otherStart = new Date(appointment.start).getTime()
    const otherEnd = otherStart + appointment.durationMin * 60_000
    return appointment.doctorId === doctorId && startDate.getTime() < otherEnd && otherStart < endMs
  })

  if (conflict) {
    res.status(409).json({
      error: 'Это время уже занято',
      conflict: { patientName: conflict.patientName, start: conflict.start },
    })
    return
  }

  const appointment: Appointment = {
    id: newId('ap'),
    patientName: String(patientName),
    phone: String(phone ?? ''),
    doctorId,
    service: String(service ?? 'Консультация'),
    start: startDate.toISOString(),
    durationMin: duration,
    status: 'confirmed',
    channel: (channel ?? 'phone') as Appointment['channel'],
  }

  db.appointments.push(appointment)

  // если по этому пациенту висит заявка — переводим её в «Записан»
  const lead = db.leads.find(
    (item) =>
      (phone && item.phone === phone) ||
      item.name.toLowerCase() === String(patientName).toLowerCase(),
  )
  if (lead && lead.status !== 'closed') {
    lead.status = 'booked'
    lead.updatedAt = new Date().toISOString()
    lead.note = `${lead.note ? `${lead.note} ` : ''}Запись ${startDate.toLocaleString('ru-RU')} к ${doctor.name}`
    broadcast('lead:update', lead)
  }

  saveDb()
  broadcast('appointment:new', appointment)
  auditRequest(
    req,
    'appointment.create',
    'appointment',
    appointment.id,
    `${patientName} · ${service} · ${startDate.toLocaleString('ru-RU')}`,
  )
  res.status(201).json(appointment)
})

/**
 * ИИ-админ. Локальный движок: понимает фразу, смотрит расписание и готовит запись.
 * Внешняя LLM сюда подключается позже — интерфейс запроса/ответа уже готов.
 */
router.post('/assistant', staffOnly, (req, res) => {
  const db = getDb()
  const { text, page, pending } = req.body ?? {}

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Пустой запрос' })
    return
  }

  const reply = assistantReply({
    text,
    page,
    pending: pending as AssistantPending | undefined,
    data: {
      doctors: db.doctors,
      appointments: db.appointments,
      patients: db.patients,
      leads: db.leads,
    },
  })

  res.json(reply)
})

// ─── Каналы и вебхуки ───────────────────────────────────────────────────────

router.get('/channels', staffOnly, (_req, res) => {
  const db = getDb()
  const items = channelStates.map((state) => {
    const lastEvent = db.events.find((event) => event.channel === state.id)
    const live =
      state.id === 'whatsapp'
        ? isWhatsAppLive() && !config.dryRun
        : state.id === 'instagram'
          ? isInstagramLive() && !config.dryRun
          : true

    return {
      ...state,
      connected: state.id === 'whatsapp' ? isWhatsAppLive() : state.id === 'instagram' ? isInstagramLive() : state.connected,
      mode: live ? ('live' as const) : ('demo' as const),
      lastEventAt: lastEvent?.at,
      verifyTokenConfigured:
        state.id === 'whatsapp' ? Boolean(config.whatsapp.verifyToken) : Boolean(config.instagram.verifyToken),
      tokenConfigured:
        state.id === 'whatsapp' ? Boolean(config.whatsapp.token) : Boolean(config.instagram.pageToken),
    }
  })

  res.json({
    items,
    publicUrl: config.publicUrl,
    metaAppSecretConfigured: Boolean(config.metaAppSecret),
  })
})

router.get('/events-log', staffOnly, (_req, res) => {
  res.json({ items: getDb().events })
})

/** Кнопка «Проверить интеграцию» в админке: создаёт демо-входящее. */
router.post('/channels/test', staffOnly, (req, res) => {
  const channel = (req.body?.channel ?? 'whatsapp') as 'whatsapp' | 'instagram' | 'site' | 'phone'
  const sample = buildSampleMessage(channel)
  const { lead, created } = ingestIncoming(sample)
  res.status(201).json({ lead, created, sample })
})

/** SSE-поток для живого обновления админки. */
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`event: ready\ndata: {"ok":true}\n\n`)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => clearInterval(heartbeat))

  addClient(res)
})

// ─── Настройки ──────────────────────────────────────────────────────────────

router.get('/settings', staffOnly, (_req, res) => {
  res.json(getDb().settings)
})

router.put('/settings', staffOnly, (req, res) => {
  const db = getDb()
  db.settings = { ...db.settings, ...req.body }
  saveDb()
  auditRequest(req, 'settings.update', 'settings', 'clinic', 'Профиль и уведомления')
  res.json(db.settings)
})

router.post('/subscribe', (req, res) => {
  // Заготовка под подписку на email/telegram-уведомления
  const email = String(req.body?.email ?? '').trim()
  if (!email) {
    res.status(400).json({ error: 'Укажите email' })
    return
  }
  addEvent({ channel: 'site', kind: 'system', text: `Подписка на уведомления: ${email}` })
  res.json({ ok: true, id: newId('sub') })
})

// ─── Вебхуки Meta ───────────────────────────────────────────────────────────

/** GET — проверка вебхука при подписке в Meta (hub.challenge в plain text!). */
function verifyWebhook(token: string) {
  return (req: express.Request, res: express.Response) => {
    const mode = req.query['hub.mode']
    const received = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && received === token) {
      console.log(`[webhook] подписка подтверждена (${mode})`)
      res.status(200).type('text/plain').send(String(challenge ?? ''))
      return
    }

    console.warn('[webhook] неверный verify_token:', received)
    res.sendStatus(403)
  }
}

function receiveWebhook(parser: (payload: unknown) => ReturnType<typeof parseWhatsApp>) {
  return (req: express.Request, res: express.Response) => {
    const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? ''
    const signature = req.header('x-hub-signature-256')

    if (!verifyMetaSignature(rawBody, signature)) {
      console.warn('[webhook] подпись не совпала — событие отклонено')
      res.sendStatus(401)
      return
    }

    // Meta требует 200 в течение 20 секунд, иначе будет ретраить.
    res.sendStatus(200)

    const messages = parser(req.body)
    for (const message of messages) {
      const { created } = ingestIncoming(message)
      console.log(`[webhook] ${message.channel}: ${created ? 'новая заявка' : 'сообщение в диалог'} — ${message.name}`)
    }
  }
}

router.get('/webhooks/whatsapp', verifyWebhook(config.whatsapp.verifyToken))
router.post('/webhooks/whatsapp', receiveWebhook(parseWhatsApp))

router.get('/webhooks/instagram', verifyWebhook(config.instagram.verifyToken))
router.post('/webhooks/instagram', receiveWebhook(parseInstagram))

/** Форма на сайте клиники — самый простой канал без токенов. */
router.post('/webhooks/site', (req, res) => {
  const { name, phone, service, message } = req.body ?? {}
  if (!name || !phone) {
    res.status(400).json({ error: 'Укажите имя и телефон' })
    return
  }

  const { lead } = ingestIncoming({
    channel: 'site',
    externalUserId: String(phone),
    name: String(name),
    phone: String(phone),
    service,
    text: String(message ?? 'Заявка с формы на сайте'),
    at: new Date().toISOString(),
  })

  res.status(201).json({ ok: true, leadId: lead.id })
})
