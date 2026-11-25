import type {
  Appointment,
  Channel,
  ChannelState,
  ClinicSettings,
  Doctor,
  Lead,
  LeadsResponse,
  Patient,
  Review,
  Stats,
} from '../../shared/types'
import * as demo from './mock'

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
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    demoMode = true
    emit('demo')
    return null
  }
}

// ─── Заявки ─────────────────────────────────────────────────────────────────

export interface LeadsQuery {
  status?: string
  channel?: string
  q?: string
}

export async function getLeads(query: LeadsQuery = {}): Promise<LeadsResponse> {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.channel) params.set('channel', query.channel)
  if (query.q) params.set('q', query.q)
  const suffix = params.toString() ? `?${params}` : ''

  return (await http<LeadsResponse>(`/api/leads${suffix}`)) ?? demo.listLeads(query)
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

export async function getPatients(q = ''): Promise<{ items: Patient[]; total: number }> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : ''
  return (await http<{ items: Patient[]; total: number }>(`/api/patients${suffix}`)) ?? demo.getPatients(q)
}

export async function getDoctors(): Promise<{ items: Doctor[] }> {
  return (await http<{ items: Doctor[] }>('/api/doctors')) ?? demo.getDoctors()
}

export async function getAppointments(): Promise<{ items: Appointment[] }> {
  return (await http<{ items: Appointment[] }>('/api/appointments')) ?? demo.getAppointments()
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
