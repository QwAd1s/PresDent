import type { DeliveryChannel } from '../shared/types'
import { config, isWhatsAppLive } from './config'
import { addEvent } from './store'

/**
 * Доставка сообщений пациентам и сотрудникам.
 * Если провайдер не настроен (или включён DRY_RUN) — сообщение не уходит,
 * но возвращается provider: 'dry-run', чтобы это было видно в журнале напоминаний.
 */

export interface DeliveryMessage {
  channel: DeliveryChannel
  /** Телефон пациента или chat_id для Telegram */
  to: string
  text: string
}

export interface DeliveryResult {
  ok: boolean
  provider: 'live' | 'dry-run'
  error?: string
}

const digits = (value: string) => value.replace(/\D/g, '')

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${response.status}: ${detail.slice(0, 200)}`)
  }
  return response
}

async function sendWhatsApp(to: string, text: string): Promise<DeliveryResult> {
  if (!isWhatsAppLive() || config.dryRun) return { ok: true, provider: 'dry-run' }

  const phone = digits(to)
  if (phone.length < 10) return { ok: false, provider: 'live', error: 'Нет корректного телефона' }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`
  await postJson(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    { Authorization: `Bearer ${config.whatsapp.token}` },
  )

  return { ok: true, provider: 'live' }
}

async function sendTelegram(to: string, text: string): Promise<DeliveryResult> {
  if (!config.telegram.token || !to) return { ok: true, provider: 'dry-run' }

  await postJson(`${config.telegram.apiBase}/bot${config.telegram.token}/sendMessage`, {
    chat_id: to,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })

  return { ok: true, provider: 'live' }
}

async function sendSms(to: string, text: string): Promise<DeliveryResult> {
  if (!config.sms.url || !config.sms.apiKey || config.dryRun) return { ok: true, provider: 'dry-run' }

  const phone = digits(to)
  if (phone.length < 10) return { ok: false, provider: 'live', error: 'Нет корректного телефона' }

  await postJson(
    config.sms.url,
    { to: phone, text, sender: config.sms.sender },
    { Authorization: `Bearer ${config.sms.apiKey}` },
  )

  return { ok: true, provider: 'live' }
}

export async function deliver(message: DeliveryMessage): Promise<DeliveryResult> {
  try {
    switch (message.channel) {
      case 'whatsapp':
        return await sendWhatsApp(message.to, message.text)
      case 'telegram':
        return await sendTelegram(message.to, message.text)
      case 'sms':
        return await sendSms(message.to, message.text)
      case 'email':
        return { ok: true, provider: 'dry-run' }
      default:
        return { ok: false, provider: 'dry-run', error: 'Неизвестный канал' }
    }
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error)
    addEvent({ channel: 'site', kind: 'error', text: `Доставка (${message.channel}): ${message2}` })
    return { ok: false, provider: 'live', error: message2 }
  }
}

/** Уведомление сотрудников в Telegram — новая заявка, отмена, напоминание. */
export async function notifyStaff(text: string): Promise<DeliveryResult> {
  if (!config.telegram.token || !config.telegram.staffChatId) {
    return { ok: true, provider: 'dry-run' }
  }
  return deliver({ channel: 'telegram', to: config.telegram.staffChatId, text })
}
