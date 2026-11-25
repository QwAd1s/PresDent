import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Lead, LeadMessage } from '../shared/types'
import { config, isInstagramLive, isWhatsAppLive } from './config'
import { addEvent, newId } from './store'

const digits = (value: string) => value.replace(/\D/g, '')

/** Проверка X-Hub-Signature-256 (sha256=hex), иначе вебхук можно подделать. */
export function verifyMetaSignature(rawBody: string, header?: string): boolean {
  if (!config.metaAppSecret) return true // секрет не задан — режим разработки
  if (!header?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', config.metaAppSecret).update(rawBody, 'utf8').digest('hex')
  const received = header.slice('sha256='.length)

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(received, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

interface SendResult {
  delivery: NonNullable<LeadMessage['delivery']>
  error?: string
}

async function sendWhatsApp(lead: Lead, text: string): Promise<SendResult> {
  if (!isWhatsAppLive() || config.dryRun) {
    return { delivery: 'queued' }
  }

  const to = digits(lead.externalId ?? lead.phone ?? '')
  if (!to) return { delivery: 'failed', error: 'Нет номера получателя' }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    return { delivery: 'failed', error: detail.slice(0, 300) }
  }
  return { delivery: 'sent' }
}

async function sendInstagram(lead: Lead, text: string): Promise<SendResult> {
  if (!isInstagramLive() || config.dryRun) {
    return { delivery: 'queued' }
  }

  const recipientId = lead.externalId
  if (!recipientId) return { delivery: 'failed', error: 'Нет IGSID получателя' }

  const url = `https://graph.facebook.com/${config.instagram.apiVersion}/${config.instagram.accountId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.instagram.pageToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  })

  if (!response.ok) {
    const detail = await response.text()
    return { delivery: 'failed', error: detail.slice(0, 300) }
  }
  return { delivery: 'sent' }
}

/**
 * Ответ пациента менеджером в тот же канал, откуда пришла заявка.
 * Важно: у Meta есть 24-часовое окно на свободные сообщения —
 * вне окна нужен шаблон (message template).
 */
export async function sendReply(lead: Lead, text: string, author = 'Администратор'): Promise<LeadMessage> {
  let result: SendResult = { delivery: 'queued' }

  try {
    if (lead.channel === 'whatsapp') result = await sendWhatsApp(lead, text)
    else if (lead.channel === 'instagram') result = await sendInstagram(lead, text)
    else result = { delivery: 'sent' } // сайт/телефон — внутренняя заметка
  } catch (error) {
    result = { delivery: 'failed', error: error instanceof Error ? error.message : String(error) }
  }

  const message: LeadMessage = {
    id: newId('m'),
    direction: 'out',
    text,
    at: new Date().toISOString(),
    author,
    delivery: result.delivery,
  }

  addEvent({
    channel: lead.channel,
    kind: result.delivery === 'failed' ? 'error' : 'outgoing',
    text:
      result.delivery === 'failed'
        ? `Ошибка отправки в ${lead.channel}: ${result.error}`
        : `Ответ для ${lead.name}: ${text}`,
  })

  return message
}
