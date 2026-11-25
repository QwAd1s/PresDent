const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60_000)

  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`

  const hours = Math.round(minutes / 60)
  if (hours < 6) return `${hours} ч назад`

  const date = new Date(iso)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  if (isToday) return `сегодня, ${formatTime(iso)}`

  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `вчера, ${formatTime(iso)}`

  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })

export const formatShortDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export const weekday = (date: Date) => WEEKDAYS[(date.getDay() + 6) % 7]

export const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`

export const initials = (name: string) =>
  name
    .replace(/[^А-Яа-яA-Za-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export const plural = (count: number, forms: [string, string, string]) => {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

/** Цвет аватара по имени — стабильный, чтобы карточки не «мигали». */
const AVATAR_COLORS = ['#0E9E7B', '#2F6FED', '#C94B8D', '#E5A63C', '#8A5CF6', '#0F8AA8', '#DD5157']
export const avatarColor = (seed: string) => {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
