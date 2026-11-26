/**
 * Общие типы для фронтенда и бэкенда.
 * Одна модель — один источник правды: и админка, и приёмники Meta-вебхуков
 * работают с этими структурами.
 */

export type Channel = 'whatsapp' | 'instagram' | 'site' | 'phone'

export type LeadStatus = 'new' | 'in_progress' | 'booked' | 'closed' | 'spam'

export type LeadPriority = 'low' | 'normal' | 'high'

export interface LeadMessage {
  id: string
  direction: 'in' | 'out'
  text: string
  at: string
  author?: string
  delivery?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
}

export interface Lead {
  id: string
  channel: Channel
  name: string
  phone?: string
  /** @ник или ID в Instagram / wa_id в WhatsApp */
  handle?: string
  service?: string
  status: LeadStatus
  priority: LeadPriority
  unread: number
  createdAt: string
  updatedAt: string
  assignee?: string
  note?: string
  messages: LeadMessage[]
  externalId?: string
}

export interface Patient {
  id: string
  name: string
  phone: string
  birthDate?: string
  since: string
  visits: number
  lastVisit: string
  totalSpent: number
  doctorId?: string
  tags: string[]
  channel?: Channel
  notes?: string
}

export interface Doctor {
  id: string
  name: string
  specialty: string
  color: string
  rating: number
  reviewsCount: number
  experienceYears: number
  loadPercent: number
  nextSlot: string
  todayAppointments: number
  workingDays: number[]
}

export type AppointmentStatus = 'confirmed' | 'waiting' | 'done' | 'cancelled'

export interface Appointment {
  id: string
  patientName: string
  phone: string
  doctorId: string
  service: string
  /** ISO-время начала */
  start: string
  durationMin: number
  status: AppointmentStatus
  channel: Channel
  note?: string
  cancelledReason?: string
  createdAt?: string
}

export interface Review {
  id: string
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  at: string
  channel: Channel
  answered: boolean
  reply?: string
  doctorId?: string
}

export interface ChannelState {
  id: Channel
  title: string
  account: string
  connected: boolean
  mode: 'live' | 'demo'
  lastEventAt?: string
  webhookPath: string
  verifyTokenConfigured: boolean
  tokenConfigured: boolean
}

export interface SeriesPoint {
  date: string
  whatsapp: number
  instagram: number
  site: number
  phone: number
}

export interface Stats {
  newLeads: number
  newLeadsDelta: number
  appointmentsToday: number
  appointmentsDelta: number
  conversion: number
  conversionDelta: number
  avgResponseMin: number
  avgResponseDelta: number
  series: SeriesPoint[]
  byChannel: { channel: Channel; count: number }[]
  doctorsLoad: { id: string; name: string; color: string; loadPercent: number; todayAppointments: number }[]
  recentReviews: Review[]
  totalLeads: number
}

export interface ClinicSettings {
  name: string
  address: string
  phone: string
  email: string
  workHours: string
  timezone: string
  autoAssign: boolean
  notifyWhatsapp: boolean
  notifyEmail: boolean
  firstResponseMinutes: number
  /** За сколько часов до приёма напоминать пациенту */
  reminderHours?: number
  /** Через сколько часов после приёма просить отзыв */
  reviewDelayHours?: number
}

export interface ChannelEvent {
  id: string
  at: string
  channel: Channel
  text: string
  kind: 'incoming' | 'outgoing' | 'system' | 'error'
}

export interface LeadsResponse {
  items: Lead[]
  counts: Record<LeadStatus, number> & { all: number }
}

// ─── Пользователи и доступы ─────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'doctor'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  /** Привязка к врачу для роли doctor */
  doctorId?: string
  /** false — доступ отключён (увольнение, отпуск) */
  active?: boolean
  createdAt: string
  lastLoginAt?: string
}

/** Как пользователь хранится на сервере (в API и на фронт не отдаётся) */
export interface StoredUser extends User {
  passwordHash: string
}

export type AuditEntity =
  | 'auth'
  | 'lead'
  | 'appointment'
  | 'review'
  | 'settings'
  | 'user'
  | 'patient'
  | 'reminder'

export interface AuditRecord {
  id: string
  at: string
  userId?: string
  userName: string
  action: string
  entity: AuditEntity
  entityId?: string
  details?: string
}

export interface SessionRecord {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
  userAgent?: string
}

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  doctor: 'Врач',
}

/** Что каждый роль умеет в интерфейсе */
export const ROLE_SCOPE: Record<UserRole, string> = {
  owner: 'Полный доступ, настройки, команда',
  admin: 'Заявки, пациенты, расписание, отзывы',
  doctor: 'Своё расписание и пациенты',
}

// ─── Напоминания ────────────────────────────────────────────────────────────

export type ReminderKind = 'appointment' | 'review'

export type ReminderStatus = 'pending' | 'sent' | 'dry_run' | 'failed' | 'skipped'

export type DeliveryChannel = 'whatsapp' | 'telegram' | 'sms' | 'email'

export interface Reminder {
  id: string
  kind: ReminderKind
  appointmentId: string
  patientName: string
  phone: string
  channel: DeliveryChannel
  text: string
  /** Когда отправлять */
  sendAt: string
  status: ReminderStatus
  attempts: number
  createdAt: string
  sentAt?: string
  error?: string
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  site: 'Сайт',
  phone: 'Телефон',
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  booked: 'Записан',
  closed: 'Закрыта',
  spam: 'Спам',
}

export const SERVICE_LIST = [
  'Консультация',
  'Гигиена и чистка',
  'Лечение кариеса',
  'Имплантация',
  'Протезирование',
  'Ортодонтия',
  'Эстетика',
  'Удаление зуба',
  'Детская стоматология',
]
