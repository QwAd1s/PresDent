import type { Channel } from '../shared/types'
import type { IncomingMessage } from './ingest'

/** Красиво форматируем российский номер из wa_id: 79852143308 → +7 985 214-33-08 */
export function formatRuPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 11) return raw
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`
}

function attachmentLabel(type?: string): string {
  switch (type) {
    case 'image':
      return '[изображение]'
    case 'video':
      return '[видео]'
    case 'audio':
    case 'voice':
      return '[голосовое сообщение]'
    case 'document':
      return '[документ]'
    case 'location':
      return '[геолокация]'
    case 'sticker':
      return '[стикер]'
    default:
      return '[вложение]'
  }
}

/**
 * WhatsApp Cloud API → нормализованные сообщения.
 * Формат: entry[].changes[].value.{contacts[], messages[], statuses[]}
 * Статусы доставки (sent/delivered/read) игнорируем — это не заявки.
 */
export function parseWhatsApp(payload: unknown): IncomingMessage[] {
  const result: IncomingMessage[] = []
  const entries = (payload as any)?.entry ?? []

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {}
      const profileName: string | undefined = value?.contacts?.[0]?.profile?.name

      for (const message of value?.messages ?? []) {
        const from = String(message.from ?? '')
        if (!from) continue

        const text =
          message.type === 'text'
            ? String(message.text?.body ?? '')
            : message.button?.text
              ? String(message.button.text)
              : message.interactive?.button_reply?.title
                ? String(message.interactive.button_reply.title)
                : attachmentLabel(message.type)

        result.push({
          channel: 'whatsapp',
          externalUserId: from,
          name: profileName ?? formatRuPhone(from),
          phone: formatRuPhone(from),
          text,
          at: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          externalId: message.id,
        })
      }
    }
  }

  return result
}

/**
 * Instagram Messaging → нормализованные сообщения.
 * Формат: entry[].messaging[].{sender.id, recipient.id, timestamp, message{mid,text}}
 * Имя пользователя Meta в вебхуке не отдаёт — username подтягивается
 * отдельным запросом Graph API (/{igsid}?fields=username).
 */
export function parseInstagram(payload: unknown): IncomingMessage[] {
  const result: IncomingMessage[] = []
  const entries = (payload as any)?.entry ?? []

  for (const entry of entries) {
    for (const event of entry?.messaging ?? []) {
      const senderId = String(event?.sender?.id ?? '')
      const text: string | undefined = event?.message?.text
      if (!senderId || (!text && !event?.message?.attachments)) continue
      if (event?.message?.is_echo) continue // эхо наших же ответов

      result.push({
        channel: 'instagram',
        externalUserId: senderId,
        name: event?.sender?.username ?? `Instagram ${senderId.slice(-4)}`,
        text: text ?? attachmentLabel(event?.message?.attachments?.[0]?.type),
        at: event?.timestamp
          ? new Date(Number(event.timestamp)).toISOString()
          : new Date().toISOString(),
        externalId: event?.message?.mid,
      })
    }
  }

  return result
}

const SAMPLE_TEXTS: Record<Channel, string[]> = {
  whatsapp: [
    'Здравствуйте! Хочу записаться на консультацию хирурга-имплантолога, сколько стоит?',
    'Добрый день, болит зуб мудрости, можно сегодня вечером?',
    'Скажите, а чистка зубов входит в полис ДМС?',
  ],
  instagram: [
    'Привет! Подскажите стоимость отбеливания и есть ли рассрочка?',
    'Здравствуйте! Хочу записаться на гигиену на субботу, есть окна?',
    'А вы делаете брекеты подросткам 14 лет?',
  ],
  site: ['Заявка с сайта: нужна консультация ортодонта'],
  phone: ['Звонок: уточняют адрес клиники и часы работы'],
}

/** Демо-событие: прогоняем через тот же конвейер, что и реальный вебхук. */
export function buildSampleMessage(channel: Channel): IncomingMessage {
  const pool = SAMPLE_TEXTS[channel]
  const text = pool[Math.floor(Math.random() * pool.length)]
  const suffix = Math.floor(1000 + Math.random() * 9000)
  const externalUserId = channel === 'whatsapp' ? `79${suffix}000${suffix}` : `ig-${suffix}`

  return {
    channel,
    externalUserId,
    name: channel === 'instagram' ? `instagram_${suffix}` : `Тест ${suffix}`,
    phone: channel === 'whatsapp' ? formatRuPhone(externalUserId) : undefined,
    text,
    at: new Date().toISOString(),
  }
}
