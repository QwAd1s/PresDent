import type { Appointment, ClinicSettings, Doctor } from './types'
import { findServiceIn, formatPrice, type Service } from './services'
import { dateWithWeekday, freeSlots, type SlotOffer } from './slots'

/**
 * ИИ-помощник для пациента (публичный сайт).
 *
 * Отвечает только по открытым данным клиники: услуги и цены, врачи, свободные окна,
 * адрес и подготовка к приёму. Никаких заявок, телефонов и истории пациентов.
 * Ключевое действие — помочь выбрать время и передать его в форму записи.
 */

export interface PatientAssistantData {
  settings: ClinicSettings
  doctors: Doctor[]
  appointments: Appointment[]
  services: Service[]
}

export interface PatientSlot {
  start: string
  label: string
  doctorId: string
  doctorName: string
  service: string
  durationMin: number
}

export interface PatientReply {
  intent: string
  text: string
  chips?: string[]
  slots?: PatientSlot[]
  action?: { service?: string; doctorId?: string; date?: string; start?: string }
}

const BASE_CHIPS = ['Услуги и цены', 'Свободное время', 'Подготовка к приёму', 'Адрес и часы']

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:()"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const onlyDay = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Локальная дата в формате YYYY-MM-DD (без сдвига часового пояса) */
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const WEEKDAYS: Array<[RegExp, number]> = [
  [/понедельник/, 1],
  [/вторник/, 2],
  [/сред[ауы]/, 3],
  [/четверг/, 4],
  [/пятниц/, 5],
  [/суббот/, 6],
  [/воскресень/, 7],
]

const MONTHS: Array<[RegExp, number]> = [
  [/январ/, 0],
  [/феврал/, 1],
  [/март/, 2],
  [/апрел/, 3],
  [/ма[йя]/, 4],
  [/июн/, 5],
  [/июл/, 6],
  [/август/, 7],
  [/сентябр/, 8],
  [/октябр/, 9],
  [/ноябр/, 10],
  [/декабр/, 11],
]

function parseDate(text: string, now = new Date()): Date | null {
  const t = normalize(text)

  if (/послезавтра/.test(t)) {
    const date = onlyDay(now)
    date.setDate(date.getDate() + 2)
    return date
  }
  if (/завтра/.test(t)) {
    const date = onlyDay(now)
    date.setDate(date.getDate() + 1)
    return date
  }
  if (/сегодня/.test(t)) return onlyDay(now)

  for (const [pattern, weekday] of WEEKDAYS) {
    if (!pattern.test(t)) continue
    const date = onlyDay(now)
    const current = date.getDay() === 0 ? 7 : date.getDay()
    date.setDate(date.getDate() + ((weekday - current + 7) % 7))
    return date
  }

  const dayMonth = t.match(/(\d{1,2})\s*(?:-?го)?\s+([а-я]+)/)
  if (dayMonth) {
    const day = Number(dayMonth[1])
    const month = MONTHS.find(([pattern]) => pattern.test(dayMonth[2]))
    if (month && day >= 1 && day <= 31) {
      const date = new Date(now.getFullYear(), month[1], day)
      if (date.getTime() < onlyDay(now).getTime()) date.setFullYear(now.getFullYear() + 1)
      return date
    }
  }

  return null
}

function parseTime(text: string): { hours: number; minutes: number } | null {
  const t = normalize(text)
  const pattern = /(?:^|\s)(?:в|к|на|с)?\s*(\d{1,2})(?::(\d{2}))?(?=\s|$)/g
  let match = pattern.exec(t)

  while (match) {
    let hours = Number(match[1])
    const minutes = Number(match[2] ?? 0)
    if (minutes > 59) {
      match = pattern.exec(t)
      continue
    }
    if (hours < 8 && /вечера|дня/.test(t)) hours += 12
    if (hours >= 8 && hours <= 23) return { hours, minutes }
    match = pattern.exec(t)
  }

  return null
}

const SERVICE_HINTS: Array<[RegExp, string]> = [
  [/чистк|гигиен|налет|камен/i, 'Гигиена и чистка'],
  [/брекет|ортодонт|выравн|элайнер|прикус/i, 'Ортодонтия'],
  [/имплант/i, 'Имплантация'],
  [/кариес|пломб|лечить|лечен/i, 'Лечение кариеса'],
  [/канал/i, 'Лечение каналов'],
  [/коронк|протез|винир/i, 'Протезирование'],
  [/отбел|эстет/i, 'Эстетика'],
  [/удал|восьм|мудрост/i, 'Удаление зуба'],
  [/ребен|ребён|детск|малыш/i, 'Детская стоматология'],
  [/томограф|кт|снимок|рентген/i, 'Компьютерная томография'],
  [/консульт|осмотр|прием|приём/i, 'Консультация'],
]

function detectService(text: string): string | null {
  for (const [pattern, title] of SERVICE_HINTS) {
    if (pattern.test(text)) return title
  }
  return null
}

const SPECIALTY_HINTS: Array<[RegExp, RegExp]> = [
  [/гигиен|чистк/i, /гигиен/],
  [/имплант|хирург|удал/i, /имплант/],
  [/ортодонт|брекет/i, /ортодонт/],
  [/детск|ребен|ребён/i, /детск/],
  [/ортопед|коронк|протез/i, /ортопед/],
  [/терапевт|лечен|кариес/i, /терапевт/],
]

function detectDoctor(text: string, doctors: Doctor[]): Doctor | null {
  const t = normalize(text)
  const words = t.split(' ')

  for (const doctor of doctors) {
    const parts = normalize(doctor.name).split(' ')
    if (parts.some((part) => part.length > 3 && words.some((word) => word.startsWith(part.slice(0, 5))))) {
      return doctor
    }
  }

  for (const [hint, specialty] of SPECIALTY_HINTS) {
    if (!hint.test(t)) continue
    const doctor = doctors.find((item) => specialty.test(normalize(item.specialty)))
    if (doctor) return doctor
  }

  return null
}

function doctorForService(service: string, doctors: Doctor[], services: Service[]): Doctor | null {
  const target = findServiceIn(services, service)
  if (!target) return doctors[0] ?? null
  return doctors.find((item) => normalize(item.specialty).includes(target.specialty)) ?? doctors[0] ?? null
}

function serviceLine(service: { title: string; price: number; durationMin: number; description?: string }): string {
  return `${service.title} — ${formatPrice(service.price)}, ${service.durationMin} мин. ${service.description ?? ''}`.trim()
}

function buildSlots(
  doctor: Doctor,
  date: Date,
  service: string,
  data: PatientAssistantData,
  limit = 6,
): PatientSlot[] {
  const duration = findServiceIn(data.services, service)?.durationMin ?? 30
  const offers: SlotOffer[] = freeSlots(doctor, date, duration, data.appointments, service, undefined, {
    limit,
    earliest: new Date(Date.now() + 60 * 60_000),
  })

  return offers.map((slot) => ({
    start: slot.start,
    label: slot.label,
    doctorId: slot.doctorId,
    doctorName: slot.doctorName,
    service,
    durationMin: slot.durationMin,
  }))
}

function priceAnswer(title: string, data: PatientAssistantData): PatientReply {
  const service = findServiceIn(data.services, title)
  if (!service) return fallback(data)

  return {
    intent: 'price',
    text: `${serviceLine(service)} Записать вас на «${service.title}»?`,
    chips: ['Свободное время', 'Записаться', 'Подготовка к приёму'],
    action: { service: service.title },
  }
}

function fallback(data: PatientAssistantData): PatientReply {
  return {
    intent: 'fallback',
    text:
      `Могу подсказать цены и услуги, свободное время у врачей, адрес и подготовку к приёму. ` +
      `Например: «сколько стоит имплантация», «есть ли окно завтра у гигиениста» или «как вы работаете в субботу». ` +
      `Если вопрос срочный — позвоните: ${data.settings.phone}.`,
    chips: BASE_CHIPS,
  }
}

export function patientAssistantReply(input: {
  text: string
  data: PatientAssistantData
}): PatientReply {
  const { text, data } = input
  const raw = text.trim()
  const t = normalize(raw)

  if (!t) return fallback(data)

  const service = detectService(raw)
  const doctor = detectDoctor(raw, data.doctors)
  const date = parseDate(raw)
  const time = parseTime(raw)

  // Срочная боль — сначала телефон и ближайшее время
  if (/болит|остро|кров|опух|травм|не могу терпеть|срочно/.test(t)) {
    const therapist = data.doctors.find((item) => /терапевт/.test(normalize(item.specialty))) ?? data.doctors[0]
    const preferred = date ?? onlyDay(new Date())
    let target = preferred
    let slots = therapist ? buildSlots(therapist, target, 'Консультация', data, 4) : []

    // если на сегодня окон уже нет — показываем завтра
    if (!slots.length && !date) {
      target = new Date(Date.now() + 86_400_000)
      slots = therapist ? buildSlots(therapist, target, 'Консультация', data, 4) : []
    }

    return {
      intent: 'urgent',
      text:
        `Понимаю, это неприятно. Если боль сильная или есть отёк — позвоните прямо сейчас: ${data.settings.phone}, ` +
        `мы постараемся принять вас в ближайшее время.` +
        (slots.length
          ? ` Ближайшие окна на ${dateWithWeekday(target.toISOString())}: ${slots.map((slot) => slot.label).join(', ')} — можно записаться ниже.`
          : ''),
      slots,
      chips: ['Записаться', 'Адрес и часы'],
      action: { service: 'Консультация', doctorId: therapist?.id, date: isoDay(target) },
    }
  }

  // Приветствие и возможности
  if (/^(привет|здравств|добрый (день|вечер|утро)|салам|ассалам)/.test(t)) {
    return {
      intent: 'greet',
      text:
        `Здравствуйте! Я помощник клиники PresiDent. Подскажу цены, врачей и свободное время, ` +
        `помогу записаться и объясню, как подготовиться к приёму. Что вас интересует?`,
      chips: BASE_CHIPS,
    }
  }

  if (/что умеешь|чем помож|помощь|как записаться/.test(t)) {
    return {
      intent: 'help',
      text:
        'Умею: рассказать про услуги и цены, показать свободные окна на удобный день, подсказать врача по специализации, ' +
        'объяснить подготовку к приёму и адрес. Запись оформляется прямо на этой странице за минуту.',
      chips: BASE_CHIPS,
    }
  }

  // Адрес, часы, контакты
  if (/адрес|где вы|как добраться|часы|график работ|во сколько|телефон|контакт/.test(t)) {
    return {
      intent: 'contacts',
      text:
        `${data.settings.name}: ${data.settings.address}. ` +
        `Часы работы — ${data.settings.workHours}. Телефон ${data.settings.phone}, почта ${data.settings.email}.`,
      chips: ['Записаться', 'Услуги и цены'],
    }
  }

  // Подготовка к приёму
  if (/подготов|что взять|можно есть|натощак|наркоз|анестез|боюсь|страшно/.test(t)) {
    return {
      intent: 'preparation',
      text:
        'Перед приёмом достаточно паспорта и, если есть, свежих снимков. ' +
        'На консультацию и гигиену можно приходить после лёгкого перекуса; ' +
        'если планируется лечение под наркозом или удаление — поесть не получится за 4–6 часов, об этом предупредит врач. ' +
        'Если вы боитесь стоматологов — скажите администратору, подберём врача и время без спешки.',
      chips: ['Записаться', 'Свободное время'],
    }
  }

  // Свободное время и запись — важнее прайса, если человек спрашивает про окна
  if (/запис|свобод|окно|когда можно|принимает/.test(t)) {
    const targetDate = date ?? new Date(Date.now() + 86_400_000)
    const targetService = service ?? 'Консультация'
    const targetDoctor = doctor ?? doctorForService(targetService, data.doctors, data.services)

    if (!targetDoctor) {
      return { intent: 'slots_empty', text: `Не нашёл врача по этому направлению. Позвоните: ${data.settings.phone}.`, chips: BASE_CHIPS }
    }

    const slots = buildSlots(targetDoctor, targetDate, targetService, data)

    if (time) {
      const wanted = new Date(targetDate)
      wanted.setHours(time.hours, time.minutes, 0, 0)
      const exact = slots.find((slot) => new Date(slot.start).getTime() === wanted.getTime())

      if (exact) {
        return {
          intent: 'booking',
          text:
            `${targetDoctor.name} свободен ${dateWithWeekday(exact.start)} в ${exact.label}. ` +
            'Нажмите на время ниже — подставлю его в форму записи.',
          slots: [exact],
          chips: ['Записаться'],
          action: { service: targetService, doctorId: targetDoctor.id, date: isoDay(targetDate), start: exact.start },
        }
      }
    }

    if (!slots.length) {
      return {
        intent: 'slots_empty',
        text:
          `${targetDoctor.name}: на ${dateWithWeekday(targetDate.toISOString())} свободных окон нет. ` +
          'Попробуйте другой день или позвоните нам — подберём время вручную.',
        chips: ['Свободное время', 'Адрес и часы'],
        action: { service: targetService, doctorId: targetDoctor.id, date: isoDay(targetDate) },
      }
    }

    return {
      intent: 'slots',
      text:
        `${targetDoctor.name} (${targetDoctor.specialty.toLowerCase()}) — ${dateWithWeekday(targetDate.toISOString())}: ` +
        `${slots.map((slot) => slot.label).join(', ')}. Нажмите на время, и я подставлю его в форму записи.`,
      slots,
      chips: ['Другое время', 'Услуги и цены'],
      action: { service: targetService, doctorId: targetDoctor.id, date: isoDay(targetDate) },
    }
  }

  // Конкретная услуга — цена и описание
  if (service) return priceAnswer(service, data)

  // Список услуг и цен
  if (/услуг|цен|прайс|сколько стоит|стоимост/.test(t)) {
    const top = data.services
      .filter((item) => item.active !== false)
      .slice(0, 6)
      .map((item) => `• ${item.title} — ${formatPrice(item.price)}`)
      .join('\n')
    return {
      intent: 'services',
      text: `Популярные услуги:\n${top}\n\nПолный список — в разделе «Услуги и цены» на этой странице. Назовите услугу, и я подскажу детали.`,
      chips: ['Имплантация', 'Гигиена и чистка', 'Ортодонтия', 'Записаться'],
    }
  }

  // Врачи
  if (/врач|доктор|специалист|кто лечит/.test(t)) {
    const target = doctor ?? (service ? doctorForService(service, data.doctors, data.services) : null)
    if (target) {
      return {
        intent: 'doctor',
        text:
          `${target.name} — ${target.specialty}, стаж ${target.experienceYears} лет, рейтинг ${target.rating.toFixed(1)}. ` +
          `Принимает ${target.workingDays.length} дней в неделю. Показать свободное время?`,
        chips: ['Свободное время', 'Записаться'],
        action: { doctorId: target.id, service: service ?? undefined },
      }
    }

    const list = data.doctors
      .slice(0, 5)
      .map((item) => {
        const [surname, first] = item.name.split(' ')
        return `• ${first} ${surname} — ${item.specialty}`
      })
      .join('\n')
    return {
      intent: 'doctors',
      text: `В клинике принимают:\n${list}\n\nСкажите, что беспокоит, — подскажу, к кому записаться.`,
      chips: ['Гигиена и чистка', 'Имплантация', 'Детская стоматология', 'Записаться'],
    }
  }

  return fallback(data)
}
