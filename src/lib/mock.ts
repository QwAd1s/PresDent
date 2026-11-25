import type {
  Appointment,
  Channel,
  ChannelEvent,
  ClinicSettings,
  Doctor,
  Lead,
  LeadStatus,
  LeadsResponse,
  Patient,
  Review,
  Stats,
} from '../../shared/types'
import {
  appointments as seedAppointments,
  clinicSettings as seedSettings,
  doctors as seedDoctors,
  leads as seedLeads,
  patients as seedPatients,
  reviews as seedReviews,
  series as seedSeries,
} from '../../shared/fixtures'
import { formatRuPhone } from './phone'

/**
 * Демо-хранилище: полная копия поведения API в памяти браузера.
 * Нужно, чтобы фронтенд можно было открыть и показать без бэкенда.
 */
const leads: Lead[] = structuredClone(seedLeads)
const patients: Patient[] = structuredClone(seedPatients)
const doctors: Doctor[] = structuredClone(seedDoctors)
const reviews: Review[] = structuredClone(seedReviews)
const appointments: Appointment[] = structuredClone(seedAppointments)
let settings: ClinicSettings = structuredClone(seedSettings)
const events: ChannelEvent[] = [
  {
    id: 'demo-ev-1',
    at: new Date().toISOString(),
    channel: 'whatsapp',
    kind: 'system',
    text: 'Демо-режим: вебхук WhatsApp ждёт реальные сообщения',
  },
  {
    id: 'demo-ev-2',
    at: new Date(Date.now() - 60_000).toISOString(),
    channel: 'instagram',
    kind: 'system',
    text: 'Демо-режим: Instagram Direct подключён к тестовому аккаунту',
  },
]

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`
const localDay = (iso: string | Date) => new Date(iso).toLocaleDateString('sv-SE')
const percent = (value: number) => Math.round(value * 10) / 10

export interface LeadQuery {
  status?: string
  channel?: string
  q?: string
}

export function listLeads(query: LeadQuery = {}): LeadsResponse {
  const search = query.q?.trim().toLowerCase()

  const base = leads.filter((lead) => {
    if (query.channel && query.channel !== 'all' && lead.channel !== query.channel) return false
    if (!search) return true
    return [lead.name, lead.phone, lead.handle, lead.service, lead.messages.at(-1)?.text]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search))
  })

  const counts: LeadsResponse['counts'] = { new: 0, in_progress: 0, booked: 0, closed: 0, spam: 0, all: 0 }
  for (const lead of base) {
    counts[lead.status] += 1
    counts.all += 1
  }

  const items = base
    .filter((lead) => !query.status || query.status === 'all' || lead.status === query.status)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  return { items, counts }
}

export function patchLead(id: string, patch: Partial<Lead>): Lead | null {
  const lead = leads.find((item) => item.id === id)
  if (!lead) return null
  Object.assign(lead, patch, { unread: 0, updatedAt: new Date().toISOString() })
  return lead
}

export function addMessage(id: string, text: string) {
  const lead = leads.find((item) => item.id === id)
  if (!lead) return null

  const message = {
    id: uid('m'),
    direction: 'out' as const,
    text,
    at: new Date().toISOString(),
    author: 'Администратор',
    delivery: 'sent' as const,
  }

  lead.messages.push(message)
  lead.unread = 0
  lead.updatedAt = message.at
  if (lead.status === 'new') lead.status = 'in_progress'

  return { message, lead }
}

export function createLead(input: { name: string; phone: string; service?: string; text?: string; channel?: Channel }) {
  const lead: Lead = {
    id: uid('lead'),
    channel: input.channel ?? 'phone',
    name: input.name,
    phone: input.phone,
    handle: input.channel === 'instagram' ? `@${input.name.toLowerCase().replace(/\s+/g, '.')}` : input.phone,
    service: input.service ?? 'Консультация',
    status: 'new',
    priority: 'normal',
    unread: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: uid('m'),
        direction: 'in',
        text: input.text ?? 'Заявка, созданная администратором',
        at: new Date().toISOString(),
      },
    ],
  }
  leads.unshift(lead)
  return lead
}

const SAMPLES: Record<Channel, string[]> = {
  whatsapp: [
    'Здравствуйте! Хочу записаться на консультацию хирурга-имплантолога, сколько стоит?',
    'Добрый день, болит зуб мудрости, можно сегодня вечером?',
  ],
  instagram: [
    'Привет! Подскажите стоимость отбеливания и есть ли рассрочка?',
    'Здравствуйте! Хочу записаться на гигиену на субботу, есть окна?',
  ],
  site: ['Заявка с сайта: нужна консультация ортодонта'],
  phone: ['Звонок: уточняют адрес клиники и часы работы'],
}

export function testIncoming(channel: Channel): { lead: Lead; created: boolean } {
  const pool = SAMPLES[channel]
  const text = pool[Math.floor(Math.random() * pool.length)]
  const suffix = Math.floor(1000 + Math.random() * 9000)
  const name = channel === 'instagram' ? `instagram_${suffix}` : `Тест ${suffix}`
  const phone = channel === 'whatsapp' ? formatRuPhone(`79${suffix}00${suffix}`) : undefined

  const lead: Lead = {
    id: uid('lead'),
    channel,
    name,
    phone,
    handle: channel === 'instagram' ? `@instagram_${suffix}` : phone,
    externalId: String(suffix),
    service: 'Консультация',
    status: 'new',
    priority: /болит|срочно/i.test(text) ? 'high' : 'normal',
    unread: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{ id: uid('m'), direction: 'in', text, at: new Date().toISOString() }],
  }

  leads.unshift(lead)
  events.unshift({
    id: uid('ev'),
    at: lead.createdAt,
    channel,
    kind: 'incoming',
    text: `Новая заявка · ${lead.name}: ${text}`,
  })

  return { lead, created: true }
}

export function getPatients(query = ''): { items: Patient[]; total: number } {
  const search = query.trim().toLowerCase()
  const items = patients
    .filter((patient) =>
      !search
        ? true
        : [patient.name, patient.phone, patient.notes, ...patient.tags]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search)),
    )
    .sort((a, b) => +new Date(b.lastVisit) - +new Date(a.lastVisit))
  return { items, total: patients.length }
}

export const getDoctors = () => ({ items: doctors })
export const getAppointments = () => ({ items: appointments })

export function getReviews() {
  const items = [...reviews].sort((a, b) => +new Date(b.at) - +new Date(a.at))
  const average = items.length ? percent(items.reduce((sum, r) => sum + r.rating, 0) / items.length) : 0
  return {
    items,
    average,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: items.filter((review) => review.rating === rating).length,
    })),
    unanswered: items.filter((review) => !review.answered).length,
  }
}

export function replyReview(id: string, reply: string): Review | null {
  const review = reviews.find((item) => item.id === id)
  if (!review) return null
  review.reply = reply
  review.answered = true
  return review
}

export function getChannels() {
  return {
    items: [
      {
        id: 'whatsapp' as Channel,
        title: 'WhatsApp Business Cloud API',
        account: '+7 495 120-14-14',
        connected: true,
        mode: 'demo' as const,
        lastEventAt: events.find((event) => event.channel === 'whatsapp')?.at,
        webhookPath: '/api/webhooks/whatsapp',
        verifyTokenConfigured: true,
        tokenConfigured: false,
      },
      {
        id: 'instagram' as Channel,
        title: 'Instagram Direct',
        account: '@president.dental',
        connected: true,
        mode: 'demo' as const,
        lastEventAt: events.find((event) => event.channel === 'instagram')?.at,
        webhookPath: '/api/webhooks/instagram',
        verifyTokenConfigured: true,
        tokenConfigured: false,
      },
      {
        id: 'site' as Channel,
        title: 'Форма на сайте клиники',
        account: 'president-dental.ru',
        connected: true,
        mode: 'live' as const,
        lastEventAt: events.find((event) => event.channel === 'site')?.at,
        webhookPath: '/api/webhooks/site',
        verifyTokenConfigured: true,
        tokenConfigured: true,
      },
      {
        id: 'phone' as Channel,
        title: 'Входящие звонки',
        account: '+7 495 120-14-14',
        connected: false,
        mode: 'demo' as const,
        webhookPath: '—',
        verifyTokenConfigured: false,
        tokenConfigured: false,
      },
    ],
    publicUrl: '',
    metaAppSecretConfigured: false,
  }
}

export const getEventsLog = () => ({ items: events })
export const getSettings = () => settings
export const saveSettings = (patch: Partial<ClinicSettings>) => {
  settings = { ...settings, ...patch }
  return settings
}

export function getStats(): Stats {
  const now = new Date()
  const todayKey = localDay(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = localDay(yesterday)

  const todayLeads = leads.filter((lead) => localDay(lead.createdAt) === todayKey)
  const yesterdayLeads = leads.filter((lead) => localDay(lead.createdAt) === yesterdayKey)
  const appointmentsToday = appointments.filter((a) => localDay(a.start) === todayKey)
  const appointmentsYesterday = appointments.filter((a) => localDay(a.start) === yesterdayKey)
  const converted = leads.filter((lead) => lead.status === 'booked' || lead.status === 'closed').length

  const series = seedSeries.map((point) => {
    if (point.date !== todayKey) return point
    const count = (channel: Channel) => todayLeads.filter((lead) => lead.channel === channel).length
    return {
      date: point.date,
      whatsapp: count('whatsapp'),
      instagram: count('instagram'),
      site: count('site'),
      phone: count('phone'),
    }
  })

  return {
    newLeads: todayLeads.length,
    newLeadsDelta: yesterdayLeads.length
      ? percent(((todayLeads.length - yesterdayLeads.length) / yesterdayLeads.length) * 100)
      : 0,
    appointmentsToday: appointmentsToday.length,
    appointmentsDelta: appointmentsToday.length - appointmentsYesterday.length,
    conversion: leads.length ? percent((converted / leads.length) * 100) : 0,
    conversionDelta: 2.4,
    avgResponseMin: 8.4,
    avgResponseDelta: -1.4,
    series,
    byChannel: (['whatsapp', 'instagram', 'site', 'phone'] as Channel[]).map((channel) => ({
      channel,
      count: leads.filter((lead) => lead.channel === channel).length,
    })),
    doctorsLoad: doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      color: doctor.color,
      loadPercent: doctor.loadPercent,
      todayAppointments: doctor.todayAppointments,
    })),
    recentReviews: [...reviews].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 3),
    totalLeads: leads.length,
  }
}

export const demoLeads = leads
export const countByStatus = () =>
  leads.reduce<Record<LeadStatus, number>>(
    (acc, lead) => {
      acc[lead.status] += 1
      return acc
    },
    { new: 0, in_progress: 0, booked: 0, closed: 0, spam: 0 },
  )
