import type {
  Appointment,
  ChannelState,
  ClinicSettings,
  Doctor,
  Lead,
  Patient,
  Review,
} from './types'

/**
 * Данные клиники без демо-заявок: врачи, справочники и настройки.
 * Заявки, пациенты, приёмы и отзывы создаются по мере работы администратора.
 */

export const doctors: Doctor[] = [
  {
    id: 'doc-1',
    name: 'Исмаилова Мадина Ахмадовна',
    specialty: 'Врач-терапевт',
    color: '#0E9E7B',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 12,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: 'doc-2',
    name: 'Магомадов Турпал Асланович',
    specialty: 'Хирург-имплантолог',
    color: '#2F6FED',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 15,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [1, 3, 4, 5, 6],
  },
  {
    id: 'doc-3',
    name: 'Яндарова Хеда Руслановна',
    specialty: 'Ортодонт',
    color: '#C94B8D',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 9,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [1, 2, 4, 5],
  },
  {
    id: 'doc-4',
    name: 'Байсултанов Ислам Вахаевич',
    specialty: 'Гигиенист',
    color: '#E8A93A',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 6,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: 'doc-5',
    name: 'Дадаева Петимат Сайд-Магомедовна',
    specialty: 'Детский стоматолог',
    color: '#8A5CF6',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 11,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [2, 3, 4, 5, 6],
  },
  {
    id: 'doc-6',
    name: 'Арсанов Зелимхан Ибрагимович',
    specialty: 'Ортопед',
    color: '#0F8AA8',
    rating: 0,
    reviewsCount: 0,
    experienceYears: 18,
    loadPercent: 0,
    nextSlot: '',
    todayAppointments: 0,
    workingDays: [1, 2, 3, 5, 6],
  },
]

export const patients: Patient[] = []
export const leads: Lead[] = []
export const appointments: Appointment[] = []
export const reviews: Review[] = []

export const channelStates: ChannelState[] = [
  {
    id: 'whatsapp',
    title: 'WhatsApp Business Cloud API',
    account: '+7 495 120-14-14',
    connected: true,
    mode: 'demo',
    webhookPath: '/api/webhooks/whatsapp',
    verifyTokenConfigured: true,
    tokenConfigured: false,
  },
  {
    id: 'instagram',
    title: 'Instagram Direct',
    account: '@president.dental',
    connected: true,
    mode: 'demo',
    webhookPath: '/api/webhooks/instagram',
    verifyTokenConfigured: true,
    tokenConfigured: false,
  },
  {
    id: 'site',
    title: 'Форма на сайте',
    account: 'president-dental.ru',
    connected: true,
    mode: 'live',
    webhookPath: '/api/webhooks/site',
    verifyTokenConfigured: true,
    tokenConfigured: true,
  },
  {
    id: 'phone',
    title: 'Входящие звонки',
    account: '+7 495 120-14-14',
    connected: false,
    mode: 'demo',
    webhookPath: '—',
    verifyTokenConfigured: false,
    tokenConfigured: false,
  },
]

export const clinicSettings: ClinicSettings = {
  name: 'Стоматология PresiDent',
  address: 'Грозный, пр-т А. Кадырова, 24',
  phone: '+7 495 120-14-14',
  email: 'hello@president-dental.ru',
  workHours: 'Пн–Сб: 09:00–21:00, Вс: 10:00–18:00',
  timezone: 'Europe/Moscow',
  autoAssign: true,
  notifyWhatsapp: true,
  notifyEmail: true,
  firstResponseMinutes: 5,
  reminderHours: 24,
  reviewDelayHours: 2,
}
