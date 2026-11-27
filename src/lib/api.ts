import type {
  Appointment,
  AuditRecord,
  Channel,
  ChannelState,
  ClinicSettings,
  Doctor,
  Lead,
  LeadsResponse,
  Patient,
  Reminder,
  Review,
  Stats,
  User,
  UserRole,
} from '../../shared/types'
import * as demo from './mock'
import type { SlotOffer } from '../../shared/slots'
import type { Service } from '../../shared/services'

const BASE = import.meta.env.VITE_API_URL ?? ''

/** Демо-режим включается автоматически, если API недоступен. */
let demoMode = false
const listeners = new Set<(type: string, payload?: unknown) => void>()

export const isDemoMode = () => demoMode

export function subscribe(listener: (type: string, payload?: unknown) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(type: string, payload?: unknown) {
  for (const listener of listeners) listener(type, payload)
}

async function http<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (demoMode) return null

  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(2_500),
    })
    if (response.status === 401) {
      emit('auth:expired')
      return null
    }
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    demoMode = true
    emit('demo')
    return null
  }
}

// ─── Авторизация ────────────────────────────────────────────────────────────

const DEMO_USER_KEY = 'president.demoUser'
export const DEMO_PASSWORD = 'president2026'

export const DEMO_ACCOUNTS: { email: string; role: UserRole; name: string }[] = [
  { email: 'owner@president.ru', role: 'owner', name: 'Мадина Ибрагимова' },
  { email: 'admin@president.ru', role: 'admin', name: 'Айшат Батаева' },
  { email: 'doctor@president.ru', role: 'doctor', name: 'Исмаилова Мадина' },
]

function demoUser(email: string): User {
  const account = DEMO_ACCOUNTS.find((item) => item.email === email) ?? DEMO_ACCOUNTS[1]
  return {
    id: `demo-${account.role}`,
    name: account.name,
    email: account.email,
    role: account.role,
    createdAt: new Date().toISOString(),
  }
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<{ ok: boolean; user?: User; error?: string }> {
  const normalized = email.trim().toLowerCase()

  if (!demoMode) {
    try {
      const response = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, password }),
        signal: AbortSignal.timeout(6_000),
      })

      if (response.ok) {
        const data = (await response.json()) as { user: User }
        return { ok: true, user: data.user }
      }

      const data = (await response.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: data?.error ?? 'Не удалось войти' }
    } catch {
      demoMode = true
      emit('demo')
    }
  }

  // демо-режим: данные живут в браузере, проверка пароля локальная
  const account = DEMO_ACCOUNTS.find((item) => item.email === normalized)
  if (!account || password !== DEMO_PASSWORD) {
    return { ok: false, error: 'Неверный e-mail или пароль' }
  }
  const user = demoUser(normalized)
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  return { ok: true, user }
}

export async function meRequest(): Promise<User | null> {
  if (!demoMode) {
    try {
      const response = await fetch(`${BASE}/api/auth/me`, { signal: AbortSignal.timeout(3_500) })
      if (response.status === 401) return null
      if (response.ok) {
        const data = (await response.json()) as { user: User }
        return data.user
      }
    } catch {
      demoMode = true
      emit('demo')
    }
  }

  const cached = localStorage.getItem(DEMO_USER_KEY)
  return cached ? (JSON.parse(cached) as User) : null
}

export async function logoutRequest(): Promise<void> {
  localStorage.removeItem(DEMO_USER_KEY)
  if (demoMode) return
  try {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', signal: AbortSignal.timeout(3_000) })
  } catch {
    /* выходим локально в любом случае */
  }
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (demoMode) {
    return currentPassword === DEMO_PASSWORD
      ? { ok: true }
      : { ok: false, error: 'В демо-режиме пароль — president2026' }
  }

  try {
    const response = await fetch(`${BASE}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
      signal: AbortSignal.timeout(6_000),
    })

    if (response.ok) return { ok: true }
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    return { ok: false, error: data?.error ?? 'Не удалось сменить пароль' }
  } catch {
    return { ok: false, error: 'Сервер недоступен' }
  }
}

export interface TeamPayload {
  items: User[]
  online: string[]
}

export async function getTeam(): Promise<TeamPayload> {
  return (await http<TeamPayload>('/api/users')) ?? { items: [], online: [] }
}

// ─── Управление сотрудниками и журнал ───────────────────────────────────────

async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: unknown,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  if (demoMode) return { ok: false, error: 'В демо-режиме действие недоступно' }

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })

    if (response.ok) return { ok: true, data: (await response.json()) as T }

    if (response.status === 401) {
      emit('auth:expired')
      return { ok: false, error: 'Сессия истекла, войдите заново' }
    }

    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    return { ok: false, error: payload?.error ?? 'Не удалось выполнить действие' }
  } catch {
    demoMode = true
    emit('demo')
    return { ok: false, error: 'Сервер недоступен' }
  }
}

export async function createUser(input: {
  name: string
  email: string
  role: UserRole
  doctorId?: string
  password?: string
}): Promise<{ ok: boolean; user?: User; temporaryPassword?: string; error?: string }> {
  const result = await sendJson<{ user: User; temporaryPassword?: string }>('/api/users', 'POST', input)
  return { ok: result.ok, user: result.data?.user, temporaryPassword: result.data?.temporaryPassword, error: result.error }
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: UserRole; active?: boolean; doctorId?: string },
): Promise<{ ok: boolean; user?: User; error?: string }> {
  const result = await sendJson<User>(`/api/users/${id}`, 'PATCH', patch)
  return { ok: result.ok, user: result.data, error: result.error }
}

export async function resetUserPassword(id: string): Promise<{ ok: boolean; password?: string; error?: string }> {
  const result = await sendJson<{ password: string }>(`/api/users/${id}/password`, 'POST', {})
  return { ok: result.ok, password: result.data?.password, error: result.error }
}

export async function logoutOtherSessions(): Promise<{ ok: boolean; ended?: number; error?: string }> {
  const result = await sendJson<{ ended: number }>('/api/auth/logout-others', 'POST', {})
  return { ok: result.ok, ended: result.data?.ended, error: result.error }
}

export interface AuditPayload {
  items: AuditRecord[]
  total: number
}export async function getAudit(params: { entity?: string; q?: string; limit?: number } = {}): Promise<AuditPayload> {
  const query = new URLSearchParams()
  if (params.entity && params.entity !== 'all') query.set('entity', params.entity)
  if (params.q) query.set('q', params.q)
  if (params.limit) query.set('limit', String(params.limit))

  const suffix = query.toString() ? `?${query}` : ''
  return (await http<AuditPayload>(`/api/audit${suffix}`)) ?? { items: [], total: 0 }
}

// ─── Напоминания ────────────────────────────────────────────────────────────

export interface ReminderStats {
  total: number
  pending: number
  sent: number
  dryRun: number
  failed: number
  dueNow: number
}

export interface RemindersPayload {
  items: Reminder[]
  stats: ReminderStats
}

const EMPTY_REMINDER_STATS: ReminderStats = { total: 0, pending: 0, sent: 0, dryRun: 0, failed: 0, dueNow: 0 }

export async function getReminders(status = 'all'): Promise<RemindersPayload> {
  const suffix = status && status !== 'all' ? `?status=${status}` : ''
  return (await http<RemindersPayload>(`/api/reminders${suffix}`)) ?? { items: [], stats: EMPTY_REMINDER_STATS }
}

export async function runReminders(): Promise<{
  ok: boolean
  planned?: { created: number; due: number }
  sent?: number
  dryRun?: number
  failed?: number
  stats?: ReminderStats
  error?: string
}> {
  const result = await sendJson<{
    planned: { created: number; due: number }
    sent: number
    dryRun: number
    failed: number
    stats: ReminderStats
  }>('/api/reminders/run', 'POST', {})

  return { ...(result.data ?? {}), ok: result.ok, error: result.error }
}

export async function skipReminder(id: string): Promise<{ ok: boolean; error?: string }> {
  const result = await sendJson<Reminder>(`/api/reminders/${id}/skip`, 'POST', {})
  return { ok: result.ok, error: result.error }
}

// ─── Заявки ─────────────────────────────────────────────────────────────────

export interface LeadsQuery {
  status?: string
  channel?: string
  q?: string
  archived?: boolean
}

export async function getLeads(query: LeadsQuery = {}): Promise<LeadsResponse> {
  const params = new URLSearchParams()
  if (query.status && query.status !== 'all') params.set('status', query.status)
  if (query.channel && query.channel !== 'all') params.set('channel', query.channel)
  if (query.q) params.set('q', query.q)
  if (query.archived) params.set('archived', '1')
  const suffix = params.toString() ? `?${params}` : ''

  return (await http<LeadsResponse>(`/api/leads${suffix}`)) ?? demo.listLeads(query)
}

export type LeadBulkAction = 'archive' | 'restore' | 'delete' | 'status'

/** Массовые действия с заявками: архив, возврат, удаление, смена статуса. */
export async function bulkLeads(
  ids: string[],
  action: LeadBulkAction,
  status?: string,
): Promise<{ ok: boolean; affected?: number; error?: string }> {
  if (demoMode) return { ok: false, error: 'В демо-режиме массовые действия недоступны' }

  const result = await sendJson<{ ok: boolean; affected: number }>('/api/leads/bulk', 'POST', {
    ids,
    action,
    status,
  })

  return { ok: result.ok, affected: result.data?.affected, error: result.error }
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
  return (
    (await http<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })) ??
    demo.patchLead(id, patch)
  )
}

export async function sendMessage(id: string, text: string) {
  const live = await http<{ message: Lead['messages'][number]; lead: Lead }>(`/api/leads/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
  return live ?? demo.addMessage(id, text)
}

export async function createLead(input: {
  name: string
  phone: string
  service?: string
  text?: string
  channel?: Channel
}): Promise<Lead | null> {
  return (
    (await http<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(input) })) ??
    demo.createLead(input)
  )
}

// ─── Справочники ────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  return (await http<Stats>('/api/stats')) ?? demo.getStats()
}

export async function getServices(): Promise<{ items: Service[] }> {
  return (await http<{ items: Service[] }>('/api/services')) ?? { items: demo.getServices() }
}

export async function createService(input: {
  title: string
  category: string
  price: number
  durationMin: number
  specialty?: string
  description?: string
}): Promise<{ ok: boolean; service?: Service; error?: string }> {
  const result = await sendJson<Service>('/api/services', 'POST', input)
  return { ok: result.ok, service: result.data, error: result.error }
}

export async function updateService(
  id: string,
  patch: Partial<Pick<Service, 'title' | 'category' | 'price' | 'durationMin' | 'specialty' | 'description' | 'active'>>,
): Promise<{ ok: boolean; service?: Service; error?: string }> {
  const result = await sendJson<Service>(`/api/services/${id}`, 'PATCH', patch)
  return { ok: result.ok, service: result.data, error: result.error }
}

export async function getPatients(q = ''): Promise<{ items: Patient[]; total: number }> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : ''
  return (await http<{ items: Patient[]; total: number }>(`/api/patients${suffix}`)) ?? demo.getPatients(q)
}

/** Новый пациент из карточки администратора. */
export async function createPatient(input: {
  name: string
  phone: string
  birthDate?: string
  doctorId?: string
  tags?: string[]
  notes?: string
  channel?: Channel
}): Promise<{ ok: boolean; patient?: Patient; error?: string }> {
  const result = await sendJson<Patient>('/api/patients', 'POST', input)
  return { ok: result.ok, patient: result.data, error: result.error }
}

/** Новый врач — без рейтинга и загрузки, они считаются из отзывов и приёмов. */
export async function createDoctor(input: {
  name: string
  specialty: string
  experienceYears?: number
  color?: string
  workingDays?: number[]
}): Promise<{ ok: boolean; doctor?: Doctor; error?: string }> {
  const result = await sendJson<Doctor>('/api/doctors', 'POST', input)
  return { ok: result.ok, doctor: result.data, error: result.error }
}

/** Полная выгрузка данных клиники в JSON (бэкап перед чисткой). */
export async function downloadExport(): Promise<{ ok: boolean; error?: string }> {
  if (demoMode) return { ok: false, error: 'В демо-режиме выгрузка недоступна' }

  try {
    const response = await fetch(`${BASE}/api/export`, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return { ok: false, error: 'Не удалось выгрузить данные' }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `president-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Сервер недоступен' }
  }
}

export async function getDoctors(): Promise<{ items: Doctor[] }> {
  return (await http<{ items: Doctor[] }>('/api/doctors')) ?? demo.getDoctors()
}

export async function getAppointments(): Promise<{ items: Appointment[] }> {
  return (await http<{ items: Appointment[] }>('/api/appointments')) ?? demo.getAppointments()
}

// ─── Записи на приём ────────────────────────────────────────────────────────

export interface SlotsPayload {
  items: SlotOffer[]
  workingDay: boolean
  dayLabel: string
}/** Свободные окна врача на конкретный день (YYYY-MM-DD). */
export async function getSlots(
  doctorId: string,
  date: string,
  service: string,
): Promise<SlotsPayload> {
  const query = new URLSearchParams({ doctorId, date, service })
  const live = await http<SlotsPayload>(`/api/slots?${query}`)
  if (live) return live

  return demo.getSlots(doctorId, date, service)
}

export async function updateAppointment(
  id: string,
  patch: { status?: Appointment['status']; note?: string; cancelledReason?: string },
): Promise<{ ok: boolean; appointment?: Appointment; error?: string }> {
  const live = await http<Appointment>(`/api/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (live) return { ok: true, appointment: live }
  return demo.updateAppointment(id, patch)
}

export async function rescheduleAppointment(
  id: string,
  start: string,
): Promise<{ ok: boolean; appointment?: Appointment; error?: string }> {
  const live = await http<Appointment>(`/api/appointments/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ start }),
  })
  if (live) return { ok: true, appointment: live }
  return demo.rescheduleAppointment(id, start)
}

// ─── Запись на приём ────────────────────────────────────────────────────────

/** Запись на приём: 409 от сервера = время заняли, пока мы думали. */
export async function bookAppointment(input: demo.AppointmentInput): Promise<{
  ok: boolean
  appointment?: Appointment
  error?: string
}> {
  if (!demoMode) {
    try {
      const response = await fetch(`${BASE}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(3_000),
      })

      if (response.ok) {
        return { ok: true, appointment: (await response.json()) as Appointment }
      }
      if (response.status === 409) {
        return { ok: false, error: 'Это время только что заняли — выберите другое' }
      }
      return { ok: false, error: 'Не удалось создать запись' }
    } catch {
      demoMode = true
      emit('demo')
    }
  }

  const result = demo.addAppointment(input)
  return result.ok ? { ok: true, appointment: result.appointment } : { ok: false, error: result.error }
}

export interface ReviewsPayload {
  items: Review[]
  average: number
  distribution: { rating: number; count: number }[]
  unanswered: number
}

export async function getReviews(): Promise<ReviewsPayload> {
  return (await http<ReviewsPayload>('/api/reviews')) ?? demo.getReviews()
}

export async function replyToReview(id: string, reply: string): Promise<Review | null> {
  return (
    (await http<Review>(`/api/reviews/${id}/reply`, { method: 'POST', body: JSON.stringify({ reply }) })) ??
    demo.replyReview(id, reply)
  )
}

// ─── Каналы ─────────────────────────────────────────────────────────────────

export interface ChannelsPayload {
  items: ChannelState[]
  publicUrl: string
  metaAppSecretConfigured: boolean
}

export async function getChannels(): Promise<ChannelsPayload> {
  return (await http<ChannelsPayload>('/api/channels')) ?? demo.getChannels()
}

export async function getEventsLog() {
  return (await http<{ items: ChannelEvent[] }>('/api/events-log')) ?? demo.getEventsLog()
}

type ChannelEvent = {
  id: string
  at: string
  channel: Channel
  text: string
  kind: 'incoming' | 'outgoing' | 'system' | 'error'
}

export async function testChannel(channel: Channel) {
  return (
    (await http<{ lead: Lead; created: boolean }>('/api/channels/test', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    })) ?? demo.testIncoming(channel)
  )
}

// ─── Настройки ──────────────────────────────────────────────────────────────

export async function getSettings(): Promise<ClinicSettings> {
  return (await http<ClinicSettings>('/api/settings')) ?? demo.getSettings()
}

export async function saveSettings(patch: Partial<ClinicSettings>): Promise<ClinicSettings> {
  return (
    (await http<ClinicSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) })) ??
    demo.saveSettings(patch)
  )
}

// ─── Realtime ───────────────────────────────────────────────────────────────

let stream: EventSource | null = null

/** Подписка на SSE — новые заявки приходят без обновления страницы. */
export function connectRealtime() {
  if (demoMode || stream) return
  try {
    stream = new EventSource(`${BASE}/api/events`)
    stream.addEventListener('lead:new', (event) => emit('lead:new', JSON.parse((event as MessageEvent).data)))
    stream.addEventListener('lead:message', (event) =>
      emit('lead:message', JSON.parse((event as MessageEvent).data)),
    )
    stream.addEventListener('lead:update', (event) => emit('lead:update', JSON.parse((event as MessageEvent).data)))
    stream.addEventListener('appointment:new', (event) =>
      emit('appointment:new', JSON.parse((event as MessageEvent).data)),
    )
    stream.addEventListener('appointment:update', (event) =>
      emit('appointment:update', JSON.parse((event as MessageEvent).data)),
    )
    stream.addEventListener('audit:new', (event) => emit('audit:new', JSON.parse((event as MessageEvent).data)))
    stream.onerror = () => {
      stream?.close()
      stream = null
      // мягкий реконнект: если API так и не поднялся — уходим в демо
      setTimeout(() => connectRealtime(), 5_000)
    }
  } catch {
    demoMode = true
  }
}

export function disconnectRealtime() {
  stream?.close()
  stream = null
}
