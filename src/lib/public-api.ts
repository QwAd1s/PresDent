import type { Service } from '../../shared/services'
import type { PatientReply } from '../../shared/patient-assistant'

const BASE = import.meta.env.VITE_API_URL ?? ''

export interface PublicDoctor {
  id: string
  name: string
  specialty: string
  color: string
  rating: number
  reviewsCount: number
  experienceYears: number
  workingDays: number[]
}

export interface PublicClinic {
  settings: {
    name: string
    address: string
    phone: string
    email: string
    workHours: string
  }
  services: Service[]
  doctors: PublicDoctor[]
  trust: { doctors: number; reviews: number; rating: number; patients: number }
}

export interface PublicSlot {
  start: string
  label: string
}

export interface BookingResult {
  appointmentId: string
  start: string
  doctor: { id: string; name: string; specialty: string }
  service: { title: string; price: number; durationMin: number }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? 'Не удалось выполнить запрос')
  }

  return (await response.json()) as T
}

export const getClinic = () => request<PublicClinic>('/api/public/clinic')

export const getPublicSlots = (doctorId: string, date: string, service: string) => {
  const query = new URLSearchParams({ doctorId, date, service })
  return request<{ items: PublicSlot[]; workingDay: boolean; dayLabel: string }>(`/api/public/slots?${query}`)
}

export const bookOnline = (input: {
  name: string
  phone: string
  service: string
  doctorId: string
  start: string
  comment?: string
}) => request<BookingResult>('/api/public/book', { method: 'POST', body: JSON.stringify(input) })

/** Вопрос ИИ-помощнику: сервер отвечает только по открытым данным клиники. */
export const askPatientAssistant = (text: string) =>
  request<PatientReply>('/api/public/assistant', { method: 'POST', body: JSON.stringify({ text }) })
