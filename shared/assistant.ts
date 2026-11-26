import type { Appointment, Doctor, Lead, Patient } from './types'

/**
 * ИИ-админ: локальный помощник администратора.
 *
 * Работает без внешних API: понимает фразы на русском, смотрит расписание,
 * ищет свободные окна и готовит запись пациента. Логика чистая (без БД и сети),
 * поэтому один и тот же движок используется и сервером, и демо-режимом фронтенда.
 * Когда появится LLM — достаточно заменить разбор интентов на вызов модели,
 * а инструменты (слоты, запись, поиск пациента) останутся те же.
 */

export interface AssistantData {
  doctors: Doctor[]
  appointments: Appointment[]
  patients: Patient[]
  leads: Lead[]
}

export interface SlotOffer {
  id: string
  start: string
  label: string
  doctorId: string
  doctorName: string
  service: string
  durationMin: number
  patientName?: string
}

export interface BookingAction {
  type: 'book'
  patientName: string
  patientPhone?: string
  doctorId: string
  doctorName: string
  service: string
  start: string
  durationMin: number
}

export interface AssistantReply {
  text: string
  intent: string
  chips?: string[]
  slots?: SlotOffer[]
  navigate?: string
  action?: BookingAction
}

export interface AssistantPending {
  doctorId: string
  start: string
  service: string
  durationMin: number
  patientName?: string
}

export interface AssistantRequest {
  text: string
  data: AssistantData
  page?: string
  pending?: AssistantPending
}

const SLOT_STEP_MIN = 30
const MAX_SLOTS = 6

const SERVICE_DURATION: Record<string, number> = {
  Консультация: 30,
  'Гигиена и чистка': 60,
  'Лечение кариеса': 60,
  Имплантация: 120,
  Протезирование: 90,
  Ортодонтия: 60,
  Эстетика: 90,
  'Удаление зуба': 60,
  'Детская стоматология': 45,
}

const SERVICE_SPECIALTY: Record<string, RegExp> = {
  'Гигиена и чистка': /гигиен/,
  Имплантация: /имплант|хирург/,
  'Удаление зуба': /имплант|хирург/,
  Ортодонтия: /ортодонт/,
  'Детская стоматология': /детск/,
  Протезирование: /ортопед/,
  'Лечение кариеса': /терапевт/,
  Эстетика: /терапевт/,
  Консультация: /терапевт/,
}

const SERVICE_HINTS: Array<[RegExp, string]> = [
  [/чистк|гигиен|налёт|налет|камен/i, 'Гигиена и чистка'],
  [/брекет|ортодонт|выравн|элайнер|прикус/i, 'Ортодонтия'],
  [/имплант/i, 'Имплантация'],
  [/кариес|пломб|лечить|лечен/i, 'Лечение кариеса'],
  [/коронк|протез|винир/i, 'Протезирование'],
  [/отбел|эстет/i, 'Эстетика'],
  [/удал|восьм|мудрост/i, 'Удаление зуба'],
  [/ребен|ребён|детск|малыш/i, 'Детская стоматология'],
  [/консульт|осмотр|приём|прием/i, 'Консультация'],
]

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

const NAV_TOPICS: Array<{ pattern: RegExp; text: string; navigate: string }> = [
  {
    pattern: /заявк|обращен|инбокс/i,
    text: 'Все обращения — в разделе «Заявки»: слева вкладки по статусам, справа фильтр по каналу и поиск. Клик по строке открывает диалог: там можно ответить пациенту, сменить статус и оставить заметку.',
    navigate: '/leads',
  },
  {
    pattern: /пациент|база|картотек/i,
    text: 'База пациентов — раздел «База пациентов»: поиск по имени, телефону или тегу, история визитов и суммы. Карточка открывается кликом по строке.',
    navigate: '/patients',
  },
  {
    pattern: /врач|доктор|специалист/i,
    text: 'Врачи — отдельный раздел: рейтинг, загрузка, ближайшие окна. Оттуда можно перейти в расписание.',
    navigate: '/doctors',
  },
  {
    pattern: /расписан|график|слот|приём|прием/i,
    text: 'Расписание — недельная сетка: цвет блока = врач, красная линия = текущее время. Стрелки вверху переключают неделю.',
    navigate: '/schedule',
  },
  {
    pattern: /отзыв|оценк|рейтинг/i,
    text: 'Отзывы — раздел «Отзывы»: лента с оценками, распределение по звёздам и кнопка публичного ответа.',
    navigate: '/reviews',
  },
  {
    pattern: /канал|интеграц|вебхук|whatsapp|ватсап|instagram|инстаграм/i,
    text: 'Каналы — раздел «Каналы и интеграции»: статус WhatsApp и Instagram, адрес вебхука, журнал событий. Кнопка «Тестовая заявка» прогоняет сообщение через тот же конвейер, что и настоящий вебхук.',
    navigate: '/channels',
  },
  {
    pattern: /настройк|сотрудник|доступ|команд/i,
    text: 'Настройки — профиль клиники, SLA первого ответа, уведомления и доступы сотрудников.',
    navigate: '/settings',
  },
]

const SKILL_CHIPS = [
  'Свободные окна на завтра',
  'Записать пациента',
  'Сколько заявок сегодня?',
  'Где посмотреть заявки?',
]

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

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export const formatRuDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

export const weekdayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long' })

/** «27 ноября (пятница)» — без падежных ловушек */
const dateWithWeekday = (iso: string) => `${formatRuDate(iso)} (${weekdayOf(iso)})`

const stem = (word: string) => (word.length >= 5 ? word.slice(0, word.length - 1) : word)

/** Сравнение с учётом склонений: «Малику» ≈ «Малика», «Тасуеву» ≈ «Тасуева» */
const sameWord = (a: string, b: string) => {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(stem(b)) || b.startsWith(stem(a))
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const weekdayNumber = (date: Date) => (date.getDay() === 0 ? 7 : date.getDay())

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

  if (/через неделю|следующ(ая|ую) недел/.test(t)) {
    const date = onlyDay(now)
    date.setDate(date.getDate() + 7)
    return date
  }

  for (const [pattern, weekday] of WEEKDAYS) {
    if (!pattern.test(t)) continue
    const date = onlyDay(now)
    const diff = (weekday - weekdayNumber(date) + 7) % 7
    date.setDate(date.getDate() + diff)
    return date
  }

  const dayMonth = t.match(/(\d{1,2})\s*(?:-?го)?\s+([а-я]+)/)
  if (dayMonth) {
    const day = Number(dayMonth[1])
    const monthEntry = MONTHS.find(([pattern]) => pattern.test(dayMonth[2]))
    if (monthEntry && day >= 1 && day <= 31) {
      const date = new Date(now.getFullYear(), monthEntry[1], day)
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
    if (hours < 8 && /вечера|дня|pm/.test(t)) hours += 12
    if (hours >= 8 && hours <= 23) return { hours, minutes }
    match = pattern.exec(t)
  }

  return null
}

function findService(text: string): string | null {
  for (const [pattern, service] of SERVICE_HINTS) {
    if (pattern.test(text)) return service
  }
  return null
}

function findDoctor(text: string, doctors: Doctor[]): Doctor | null {
  const t = normalize(text)
  const words = t.split(' ')

  for (const doctor of doctors) {
    const parts = normalize(doctor.name).split(' ')
    const [surname, first] = parts
    if (words.some((word) => sameWord(word, surname))) return doctor
    if (first && first.length > 3 && words.some((word) => sameWord(word, first))) return doctor
  }

  const specialty = SERVICE_HINTS.find(([pattern]) => pattern.test(t))
  if (specialty) {
    const service = specialty[1]
    const matcher = SERVICE_SPECIALTY[service]
    const doctor = doctors.find((item) => matcher?.test(normalize(item.specialty)))
    if (doctor) return doctor
  }

  if (/гигиен/.test(t)) return doctors.find((doctor) => /гигиен/.test(normalize(doctor.specialty))) ?? null
  if (/ортодонт/.test(t)) return doctors.find((doctor) => /ортодонт/.test(normalize(doctor.specialty))) ?? null
  if (/хирург|имплант/.test(t)) return doctors.find((doctor) => /имплант/.test(normalize(doctor.specialty))) ?? null
  if (/детск/.test(t)) return doctors.find((doctor) => /детск/.test(normalize(doctor.specialty))) ?? null
  if (/ортопед/.test(t)) return doctors.find((doctor) => /ортопед/.test(normalize(doctor.specialty))) ?? null
  if (/терапевт/.test(t)) return doctors.find((doctor) => /терапевт/.test(normalize(doctor.specialty))) ?? null

  return null
}

function findPatient(text: string, patients: Patient[]): Patient | null {
  const words = normalize(text).split(' ')
  for (const patient of patients) {
    const parts = normalize(patient.name).split(' ')
    if (parts.some((part) => part.length > 2 && words.some((word) => sameWord(word, part)))) return patient
  }
  return null
}

function doctorForService(service: string, doctors: Doctor[]): Doctor | null {
  const matcher = SERVICE_SPECIALTY[service]
  if (!matcher) return doctors[0] ?? null
  return doctors.find((doctor) => matcher.test(normalize(doctor.specialty))) ?? doctors[0] ?? null
}

function overlaps(startA: Date, minutesA: number, startB: Date, minutesB: number) {
  const endA = startA.getTime() + minutesA * 60_000
  const endB = startB.getTime() + minutesB * 60_000
  return startA.getTime() < endB && startB.getTime() < endA
}

function workingWindow(date: Date): { open: number; close: number } {
  return date.getDay() === 0 ? { open: 10, close: 18 } : { open: 9, close: 21 }
}

function freeSlots(
  doctor: Doctor,
  date: Date,
  durationMin: number,
  data: AssistantData,
  service: string,
  patientName?: string,
): SlotOffer[] {
  const { open, close } = workingWindow(date)
  const busy = data.appointments
    .filter((appointment) => appointment.doctorId === doctor.id && sameDay(new Date(appointment.start), date))
    .map((appointment) => ({
      start: new Date(appointment.start),
      minutes: appointment.durationMin,
    }))

  const now = new Date()
  const earliest = new Date(now.getTime() + 60 * 60_000)
  const offers: SlotOffer[] = []

  for (let minutes = open * 60; minutes + durationMin <= close * 60; minutes += SLOT_STEP_MIN) {
    if (offers.length >= MAX_SLOTS) break

    const candidate = new Date(date)
    candidate.setHours(0, minutes, 0, 0)

    if (candidate.getTime() < earliest.getTime()) continue
    if (busy.some((item) => overlaps(candidate, durationMin, item.start, item.minutes))) continue

    offers.push({
      id: `${doctor.id}-${candidate.toISOString()}`,
      start: candidate.toISOString(),
      label: formatTime(candidate.toISOString()),
      doctorId: doctor.id,
      doctorName: doctor.name,
      service,
      durationMin,
      patientName,
    })
  }

  return offers
}

function nextWorkingDay(doctor: Doctor, from: Date): Date {
  const date = onlyDay(from)
  for (let shift = 1; shift <= 7; shift += 1) {
    date.setDate(date.getDate() + 1)
    if (doctor.workingDays.includes(weekdayNumber(date))) return new Date(date)
  }
  return date
}

function buildSlotsReply(args: {
  doctor: Doctor
  date: Date
  offers: SlotOffer[]
  durationMin: number
  data: AssistantData
  patientName?: string
  service: string
}): AssistantReply {
  const { doctor, date, offers, durationMin, data, patientName, service } = args

  if (!offers.length) {
    const next = nextWorkingDay(doctor, date)
    const nextOffers = freeSlots(doctor, next, durationMin, data, service, patientName)
    return {
      intent: 'slots_empty',
      text:
        `${doctor.name}: на ${dateWithWeekday(date.toISOString())} свободных окон нет.` +
        (nextOffers.length
          ? ` Ближайшее — ${dateWithWeekday(next.toISOString())}: ${nextOffers.map((slot) => slot.label).join(', ')}.`
          : ' Посмотрите другую неделю в разделе «Расписание».'),
      chips: ['Показать расписание', 'Другое время'],
      navigate: nextOffers.length ? undefined : '/schedule',
    }
  }

  return {
    intent: 'slots',
    text:
      `${doctor.name} (${doctor.specialty.toLowerCase()}) — ${dateWithWeekday(date.toISOString())}: ` +
      `${offers.map((slot) => slot.label).join(', ')}. ` +
      (patientName
        ? `Нажмите на время — оформлю запись на «${service}».`
        : 'Выберите время — оформлю запись.'),
    slots: offers,
    chips: patientName ? ['Другое время', 'Показать расписание'] : ['Записать пациента', 'Другое время'],
  }
}

function statsReply(data: AssistantData): AssistantReply {
  const now = new Date()
  const todayLeads = data.leads.filter((lead) => sameDay(new Date(lead.createdAt), now))
  const todayAppointments = data.appointments.filter((appointment) => sameDay(new Date(appointment.start), now))
  const pending = data.leads.filter((lead) => lead.status === 'new').length
  const booked = data.leads.filter((lead) => lead.status === 'booked').length

  return {
    intent: 'stats',
    text:
      `Сегодня: ${todayLeads.length} новых обращений, ${todayAppointments.length} приёмов в расписании. ` +
      `Без ответа — ${pending}, записано — ${booked}. ` +
      `Средняя загрузка врачей ${Math.round(
        data.doctors.reduce((sum, doctor) => sum + doctor.loadPercent, 0) / Math.max(data.doctors.length, 1),
      )}%.`,
    chips: ['Показать новые заявки', 'Свободные окна на завтра'],
    navigate: '/leads',
  }
}

export function assistantReply({ text, data, page, pending }: AssistantRequest): AssistantReply {
  const raw = text.trim()
  const t = normalize(raw)

  if (!t) {
    return {
      intent: 'empty',
      text: 'Напишите, что нужно сделать: найти окно, записать пациента или подсказать раздел интерфейса.',
      chips: SKILL_CHIPS,
    }
  }

  // 1. Ждём имя пациента для ранее выбранного слота
  if (pending) {
    const knownPatient = findPatient(raw, data.patients)
    const looksLikeName =
      /^[а-яёa-z][а-яёa-z\-]+(\s+[а-яёa-z\-]+){0,3}$/i.test(raw) &&
      !/(запиши|записать|свобод|окно|завтра|сегодня|время|нет|отмен|другое|покажи)/i.test(raw)
    const name = knownPatient?.name ?? (looksLikeName ? raw : null)

    if (name) {
      const doctor = data.doctors.find((item) => item.id === pending.doctorId)
      if (!doctor) {
        return { intent: 'book_error', text: 'Врач не найден, выберите время заново.', chips: ['Свободные окна на завтра'] }
      }

      // слот мог уйти, пока администратор печатал имя
      const slotDate = new Date(pending.start)
      const taken = data.appointments.some(
        (appointment) =>
          appointment.doctorId === doctor.id &&
          overlaps(slotDate, pending.durationMin, new Date(appointment.start), appointment.durationMin),
      )

      if (taken) {
        const offers = freeSlots(doctor, onlyDay(slotDate), pending.durationMin, data, pending.service, name)
        return {
          intent: 'book_busy',
          text:
            `Это время только что заняли. ${doctor.name} — свободно ${dateWithWeekday(slotDate.toISOString())}: ` +
            `${offers.map((slot) => slot.label).join(', ') || 'окон нет'}. Выберите другое время.`,
          slots: offers,
        }
      }

      return {
        intent: 'book',
        text:
          `Запись: ${name} · ${doctor.name} · ${dateWithWeekday(pending.start)} в ${formatTime(pending.start)} ` +
          `· «${pending.service}». Оформляю.`,
        action: {
          type: 'book',
          patientName: name,
          patientPhone: knownPatient?.phone,
          doctorId: doctor.id,
          doctorName: doctor.name,
          service: pending.service,
          start: pending.start,
          durationMin: pending.durationMin,
        },
        chips: ['Открыть расписание', 'Свободные окна на завтра'],
        navigate: '/schedule',
      }
    }

    if (/отмен|нет|другое/i.test(t)) {
      return { intent: 'book_cancel', text: 'Хорошо, отменил. Выберите другое время — покажу окна.', chips: ['Свободные окна на завтра'] }
    }
  }

  // 2. Приветствие и возможности
  if (/^(привет|здравств|добрый (день|вечер|утро)|салам|ассалам|хай)/.test(t)) {
    return {
      intent: 'greet',
      text:
        'Здравствуйте! Я ИИ-админ клиники PresiDent. Подскажу раздел интерфейса, найду свободное окно, запишу пациента и покажу загрузку врачей. С чего начнём?',
      chips: SKILL_CHIPS,
      navigate: page === '/' ? undefined : '/',
    }
  }

  if (/что (ты )?умеешь|чем помож|твои возможност|help|помощь|как работ/.test(t)) {
    return {
      intent: 'help',
      text:
        'Умею: 1) подсказать, где что находится в админке; 2) показать свободные окна врача на нужный день; 3) записать пациента и проверить, не занято ли время; 4) рассказать про загрузку и заявки. ' +
        'Просто напишите задачу обычными словами — например «запиши Малику на чистку в субботу».',
      chips: SKILL_CHIPS,
    }
  }

  // 3. Заявки и статистика
  if (/(заявк|обращен|статистик|загрузк|сколько|записей|приёмов|приемов)/.test(t) && /(сегодня|сколько|статистик|загрузк)/.test(t)) {
    return statsReply(data)
  }

  // 4. Поиск пациента
  if (/пациент|карточк|найди|кто так|истори/.test(t)) {
    const patient = findPatient(raw, data.patients)
    if (patient) {
      const doctor = data.doctors.find((item) => item.id === patient.doctorId)
      return {
        intent: 'patient',
        text:
          `${patient.name}, ${patient.phone}. В клинике с ${new Date(patient.since).toLocaleDateString('ru-RU')}, ` +
          `визитов: ${patient.visits}, потрачено ${new Intl.NumberFormat('ru-RU').format(patient.totalSpent)} ₽. ` +
          `Лечащий врач — ${doctor?.name ?? 'не назначен'}.${patient.notes ? ` Заметка: ${patient.notes}` : ''}`,
        chips: ['Показать базу пациентов', 'Записать пациента'],
        navigate: '/patients',
      }
    }
  }

  // 5. Запись пациента
  const bookingIntent = /(запиши|записать|забронир|оформ|поставь)/.test(t)
  const patient = findPatient(raw, data.patients)
  const service = findService(raw) ?? 'Консультация'
  const durationMin = SERVICE_DURATION[service] ?? 60

  // 5.0 Пациент назван без глагола: «Малика Гайсумова» — показываем окна его врача
  const barePatient = patient
  if (!bookingIntent && barePatient && !/занят|свобод|расписан|где|куда|сколько|найди|пациент|кто/.test(t)) {
    const date = parseDate(raw) ?? new Date(Date.now() + 86_400_000)
    const doctor = data.doctors.find((item) => item.id === barePatient.doctorId) ?? doctorForService(service, data.doctors)
    if (doctor) {
      const offers = freeSlots(doctor, date, durationMin, data, service, barePatient.name)
      return buildSlotsReply({ doctor, date, offers, durationMin, data, patientName: barePatient.name, service })
    }
  }

  if (bookingIntent) {
    if (!patient) {
      const pendingDoctor = pending ? data.doctors.find((item) => item.id === pending.doctorId) : undefined
      const pendingDate = pending ? onlyDay(new Date(pending.start)) : null
      const slotsDate = pendingDate ?? parseDate(raw) ?? new Date(Date.now() + 86_400_000)
      const doctor = pendingDoctor ?? findDoctor(raw, data.doctors) ?? doctorForService(service, data.doctors)
      const effectiveService = pending?.service ?? service
      const effectiveDuration = pending?.durationMin ?? durationMin

      if (!doctor) {
        return { intent: 'book_error', text: 'Не нашёл подходящего врача. Уточните специализацию.', chips: SKILL_CHIPS }
      }
      const offers = freeSlots(doctor, slotsDate, effectiveDuration, data, effectiveService)
      return {
        intent: 'book_need_name',
        text:
          (pending ? 'На чьё имя оформить запись? ' : 'Не нашёл такого пациента в базе. Напишите имя и фамилию полностью — создам запись на новое имя. ') +
          (offers.length
            ? `${doctor.name}: ${dateWithWeekday(slotsDate.toISOString())} свободно ${offers.map((slot) => slot.label).join(', ')}.`
            : ''),
        slots: offers,
        chips: data.patients.slice(0, 3).map((item) => item.name),
      }
    }

    const date = parseDate(raw) ?? new Date(Date.now() + 86_400_000)
    const time = parseTime(raw)
    const doctor = findDoctor(raw, data.doctors) ?? doctorForService(service, data.doctors)

    if (!doctor) {
      return { intent: 'book_error', text: 'Не нашёл подходящего врача. Уточните специализацию.', chips: SKILL_CHIPS }
    }

    if (!doctor.workingDays.includes(weekdayNumber(date))) {
      const next = nextWorkingDay(doctor, date)
      const offers = freeSlots(doctor, next, durationMin, data, service, patient.name)
      return {
        intent: 'book_day_off',
        text:
          `${doctor.name} не принимает ${dateWithWeekday(date.toISOString())}. ` +
          `Ближайший рабочий день — ${dateWithWeekday(next.toISOString())}` +
          (offers.length ? `: свободно ${offers.map((slot) => slot.label).join(', ')}.` : '.'),
        slots: offers,
      }
    }

    if (time) {
      const candidate = new Date(date)
      candidate.setHours(time.hours, time.minutes, 0, 0)
      const busy = data.appointments.some(
        (appointment) =>
          appointment.doctorId === doctor.id &&
          overlaps(candidate, durationMin, new Date(appointment.start), appointment.durationMin),
      )

      if (!busy && candidate.getTime() > Date.now()) {
        return {
          intent: 'book',
          text:
            `Запись: ${patient.name} · ${doctor.name} · ${dateWithWeekday(candidate.toISOString())} в ` +
            `${formatTime(candidate.toISOString())} · «${service}». Оформляю.`,
          action: {
            type: 'book',
            patientName: patient.name,
            patientPhone: patient.phone,
            doctorId: doctor.id,
            doctorName: doctor.name,
            service,
            start: candidate.toISOString(),
            durationMin,
          },
          chips: ['Открыть расписание', 'Свободные окна на завтра'],
          navigate: '/schedule',
        }
      }

      const offers = freeSlots(doctor, date, durationMin, data, service, patient.name)
      return {
        intent: 'book_busy',
        text:
          `${doctor.name} в ${formatTime(candidate.toISOString())} занят. ` +
          `Свободно ${dateWithWeekday(date.toISOString())}: ` +
          `${offers.map((slot) => slot.label).join(', ') || 'окон нет'}. Выберите время — оформлю запись.`,
        slots: offers,
      }
    }

    const offers = freeSlots(doctor, date, durationMin, data, service, patient.name)
    return buildSlotsReply({ doctor, date, offers, durationMin, data, patientName: patient.name, service })
  }

  // 6. Проверка занятости и расписание врача
  const availability = /(занят|свобод|окно|окна|расписан|принимает|график|когда можно)/.test(t)
  if (availability) {
    const doctor = findDoctor(raw, data.doctors)
    const date = parseDate(raw) ?? new Date()
    const time = parseTime(raw)

    if (doctor && time) {
      const candidate = new Date(date)
      candidate.setHours(time.hours, time.minutes, 0, 0)
      const appointment = data.appointments.find(
        (item) =>
          item.doctorId === doctor.id && overlaps(candidate, 60, new Date(item.start), item.durationMin),
      )
      return {
        intent: 'availability',
        text: appointment
          ? `${doctor.name} занят ${dateWithWeekday(candidate.toISOString())} в ${formatTime(candidate.toISOString())}: приём — ${appointment.patientName} («${appointment.service}»).`
          : `${doctor.name} свободен ${dateWithWeekday(candidate.toISOString())} в ${formatTime(candidate.toISOString())}. Записать пациента?`,
        chips: appointment ? ['Показать свободные окна', 'Показать расписание'] : ['Записать пациента', 'Показать расписание'],
      }
    }

    if (doctor) {
      const busy = data.appointments
        .filter((item) => item.doctorId === doctor.id && sameDay(new Date(item.start), date))
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))
      const offers = freeSlots(doctor, date, 60, data, 'Консультация', patient?.name)

      return {
        intent: 'doctor_schedule',
        text:
          `${doctor.name} (${doctor.specialty}), ${dateWithWeekday(date.toISOString())}, загрузка ${doctor.loadPercent}%. ` +
          `Приёмы: ${busy.length ? busy.map((item) => `${formatTime(item.start)} — ${item.patientName}`).join('; ') : 'нет'}. ` +
          `Свободно: ${offers.length ? offers.map((slot) => slot.label).join(', ') : 'окон нет'}.`,
        slots: offers,
        chips: ['Показать расписание', 'Свободные окна на завтра'],
        navigate: undefined,
      }
    }

    // без конкретного врача — общая картина по дню
    const perDoctor = data.doctors
      .map((item) => {
        const slots = freeSlots(item, date, 60, data, item.specialty)
        return slots.length
          ? { name: item.name, slots: slots.slice(0, 3).map((slot) => slot.label) }
          : null
      })
      .filter((item): item is { name: string; slots: string[] } => item !== null)

    const shown = perDoctor.slice(0, 4)
    const rest = perDoctor.length - shown.length

    return {
      intent: 'day_schedule',
      text:
        `Свободные окна на ${dateWithWeekday(date.toISOString())}: ` +
        (shown.length
          ? `${shown.map((item) => `${item.name} — ${item.slots.join(', ')}`).join('; ')}` +
            (rest > 0 ? ` и ещё ${rest} врача — в разделе «Расписание».` : '.')
          : 'все заняты.'),
      chips: ['Показать расписание', 'Записать пациента'],
      navigate: '/schedule',
    }
  }

  // 7. Подсказки по интерфейсу
  for (const topic of NAV_TOPICS) {
    if (topic.pattern.test(t)) {
      return { intent: 'navigate', text: topic.text, navigate: topic.navigate, chips: ['Открыть раздел', ...SKILL_CHIPS.slice(0, 2)] }
    }
  }

  if (/куда|где|как (найти|посмотреть|открыть)|подскаж|не могу найти|путаюсь|интерфейс/.test(t)) {
    return {
      intent: 'navigate_help',
      text:
        `Вы сейчас в разделе «${page ?? 'Главная'}». Слева — меню: Заявки, База пациентов, Врачи, Расписание, Отзывы, Каналы и интеграции, Настройки. ` +
        'Скажите, что нужно найти, — подсвечу нужный раздел.',
      chips: SKILL_CHIPS,
    }
  }

  return {
    intent: 'fallback',
    text:
      'Пока не понял формулировку. Попробуйте так: «свободные окна на завтра», «запиши Малику на чистку в субботу», ' +
      '«занят ли Турпал сегодня в 16:00», «найди пациента Тасуеву» или «где отзывы».',
    chips: SKILL_CHIPS,
  }
}
