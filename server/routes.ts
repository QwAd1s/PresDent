import express from 'express'
import type { Lead, LeadsResponse, LeadStatus, Stats } from '../shared/types'
import { channelStates, series as seedSeries } from '../shared/fixtures'
import { addEvent, getDb, newId, saveDb } from './store'
import { broadcast, addClient, clientsCount } from './realtime'
import { ingestIncoming } from './ingest'
import { sendReply, verifyMetaSignature } from './channels'
import { buildSampleMessage, parseInstagram, parseWhatsApp } from './webhooks'
import { config, isInstagramLive, isWhatsAppLive } from './config'

export const router = express.Router()

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
    dryRun: config.dryRun,
    whatsapp: isWhatsAppLive() ? 'live' : 'demo',
    instagram: isInstagramLive() ? 'live' : 'demo',
    sseClients: clientsCount(),
  })
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

router.get('/leads', (req, res) => {
  const db = getDb()
  const { status, channel, q } = req.query as Record<string, string | undefined>
  const search = q?.trim().toLowerCase()

  const matchesSearch = (lead: Lead) => {
    if (!search) return true
    return [lead.name, lead.phone, lead.handle, lead.service, lead.messages.at(-1)?.text]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search))
  }

  const base = db.leads.filter(
    (lead) => (!channel || lead.channel === channel) && matchesSearch(lead),
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
    .filter((lead) => !status || status === 'all' || lead.status === status)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  const payload: LeadsResponse = { items, counts }
  res.json(payload)
})

router.get('/leads/:id', (req, res) => {
  const lead = getDb().leads.find((item) => item.id === req.params.id)
  if (!lead) {
    res.status(404).json({ error: 'Заявка не найдена' })
    return
  }
  res.json(lead)
})

router.patch('/leads/:id', (req, res) => {
  const db = getDb()
  const lead = db.leads.find((item) => item.id === req.params.id)
  if (!lead) {
    res.status(404).json({ error: 'Заявка не найдена' })
    return
  }

  const { status, priority, assignee, note, service } = req.body ?? {}
  if (status) lead.status = status as LeadStatus
  if (priority) lead.priority = priority
  if (assignee !== undefined) lead.assignee = assignee
  if (note !== undefined) lead.note = note
  if (service !== undefined) lead.service = service
  lead.unread = 0
  lead.updatedAt = new Date().toISOString()

  saveDb()
  broadcast('lead:update', lead)
  res.json(lead)
})

router.post('/leads', (req, res) => {
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

  res.status(201).json(lead)
})

router.post('/leads/:id/messages', async (req, res) => {
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

router.post('/reviews/:id/reply', (req, res) => {
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
  res.json(review)
})

router.get('/appointments', (_req, res) => {
  res.json({ items: getDb().appointments })
})

// ─── Каналы и вебхуки ───────────────────────────────────────────────────────

router.get('/channels', (_req, res) => {
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

router.get('/events-log', (_req, res) => {
  res.json({ items: getDb().events })
})

/** Кнопка «Проверить интеграцию» в админке: создаёт демо-входящее. */
router.post('/channels/test', (req, res) => {
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

router.get('/settings', (_req, res) => {
  res.json(getDb().settings)
})

router.put('/settings', (req, res) => {
  const db = getDb()
  db.settings = { ...db.settings, ...req.body }
  saveDb()
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
