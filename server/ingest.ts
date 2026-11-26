import type { Channel, Lead, LeadMessage, LeadPriority } from '../shared/types'
import { addEvent, getDb, newId, saveDb } from './store'
import { broadcast } from './realtime'
import { notifyStaff } from './delivery'

export interface IncomingMessage {
  channel: Channel
  /** wa_id, IGSID или телефон — сырой идентификатор из вебхука */
  externalUserId: string
  /** Человеческое имя из профиля (pushName / username) */
  name: string
  text: string
  at: string
  /** ID сообщения в Meta — для дедупликации */
  externalId?: string
  phone?: string
  service?: string
}

/** Сколько часов считаем диалог «живым», прежде чем открыть новую заявку. */
const DIALOG_TTL_HOURS = 24

const HIGH_PRIORITY = /срочн|болит|больн|кров|опух|травм|воспал|не могу/i

const SERVICE_HINTS: Array<[RegExp, string]> = [
  [/имплант/i, 'Имплантация'],
  [/брекет|ортодонт|выравн|элайнер/i, 'Ортодонтия'],
  [/чистк|гигиен|налёт|налет|камен/i, 'Гигиена и чистка'],
  [/кариес|пломб|лечить|лечен/i, 'Лечение кариеса'],
  [/коронк|протез|винир/i, 'Протезирование'],
  [/отбел|эстет|винир/i, 'Эстетика'],
  [/удал|восьм|мудрост/i, 'Удаление зуба'],
  [/ребен|ребён|детск|малыш/i, 'Детская стоматология'],
]

export function guessService(text: string): string {
  for (const [pattern, service] of SERVICE_HINTS) {
    if (pattern.test(text)) return service
  }
  return 'Консультация'
}

export function guessPriority(text: string): LeadPriority {
  return HIGH_PRIORITY.test(text) ? 'high' : 'normal'
}

/**
 * Единая точка входа для всех каналов.
 * Нормализованное сообщение → заявка (новая или продолжение диалога).
 */
export function ingestIncoming(
  input: IncomingMessage,
): { lead: Lead; created: boolean; message: LeadMessage } {
  const db = getDb()
  const now = Date.now()
  const text = input.text.trim()

  const message: LeadMessage = {
    id: newId('m'),
    direction: 'in',
    text: text || '[вложение]',
    at: input.at,
  }

  const existing = db.leads.find((lead) => {
    if (lead.channel !== input.channel) return false
    if (lead.status === 'closed' || lead.status === 'spam') return false
    const fresh = now - new Date(lead.updatedAt).getTime() < DIALOG_TTL_HOURS * 3_600_000
    const sameUser = lead.externalId === input.externalUserId
    const samePhone = Boolean(input.phone && lead.phone === input.phone)
    return fresh && (sameUser || samePhone)
  })

  if (existing) {
    existing.messages.push(message)
    existing.unread += 1
    existing.updatedAt = input.at
    if (existing.status === 'closed') existing.status = 'new'
    if (input.service && !existing.service) existing.service = input.service

    saveDb()
    addEvent({
      channel: input.channel,
      kind: 'incoming',
      text: `${existing.name}: ${message.text}`,
    })
    broadcast('lead:message', { leadId: existing.id, message })
    return { lead: existing, created: false, message }
  }

  const lead: Lead = {
    id: newId('lead'),
    channel: input.channel,
    name: input.name || 'Без имени',
    phone: input.phone,
    handle: input.channel === 'instagram' ? `@${input.name.toLowerCase().replace(/\s+/g, '.')}` : input.phone,
    externalId: input.externalUserId,
    service: input.service ?? guessService(text),
    status: 'new',
    priority: guessPriority(text),
    unread: 1,
    createdAt: input.at,
    updatedAt: input.at,
    messages: [message],
  }

  db.leads.unshift(lead)
  saveDb()
  addEvent({
    channel: input.channel,
    kind: 'incoming',
    text: `Новая заявка · ${lead.name}: ${message.text}`,
  })
  broadcast('lead:new', lead)

  // сотрудники получают уведомление в Telegram (если настроен)
  void notifyStaff(
    `<b>Новая заявка</b> (${lead.channel})\n${lead.name}${lead.phone ? ` · ${lead.phone}` : ''}\n` +
      `${lead.service ?? 'без услуги'}\n\n${message.text}`,
  )

  return { lead, created: true, message }
}
