import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Appointment,
  ChannelEvent,
  ClinicSettings,
  Doctor,
  Lead,
  Patient,
  Review,
} from '../shared/types'
import {
  appointments as seedAppointments,
  clinicSettings as seedSettings,
  doctors as seedDoctors,
  leads as seedLeads,
  patients as seedPatients,
  reviews as seedReviews,
} from '../shared/fixtures'

export interface Database {
  version: number
  leads: Lead[]
  patients: Patient[]
  doctors: Doctor[]
  reviews: Review[]
  appointments: Appointment[]
  settings: ClinicSettings
  events: ChannelEvent[]
}

/** Поднимаем, когда меняются демо-данные: старый db.json пересоздастся. */
const SEED_VERSION = 2

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

let db: Database | null = null
let saveTimer: NodeJS.Timeout | null = null

function seed(): Database {
  return {
    version: SEED_VERSION,
    leads: structuredClone(seedLeads),
    patients: structuredClone(seedPatients),
    doctors: structuredClone(seedDoctors),
    reviews: structuredClone(seedReviews),
    appointments: structuredClone(seedAppointments),
    settings: structuredClone(seedSettings),
    events: [
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        channel: 'whatsapp',
        kind: 'system',
        text: 'Вебхук WhatsApp Cloud API активен, ожидаем события',
      },
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        channel: 'instagram',
        kind: 'system',
        text: 'Вебхук Instagram Messaging активен, ожидаем события',
      },
    ],
  }
}

export function getDb(): Database {
  if (db) return db

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Database

    // данные из старой версии фикстур — пересоздаём
    if (parsed.version !== SEED_VERSION) {
      db = seed()
      saveDb()
      return db
    }

    db = parsed
    db.events ??= []
  } catch {
    db = seed()
    saveDb()
  }

  return db
}

/** Дебаунс: не пишем файл на каждый чих. */
export function saveDb(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
    } catch (error) {
      console.error('[store] не удалось сохранить базу:', error)
    }
  }, 250)
}

export function addEvent(event: Omit<ChannelEvent, 'id' | 'at'>): ChannelEvent {
  const database = getDb()
  const full: ChannelEvent = { ...event, id: randomUUID(), at: new Date().toISOString() }
  database.events.unshift(full)
  database.events = database.events.slice(0, 80)
  saveDb()
  return full
}

export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`
