import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Appointment,
  AuditRecord,
  ChannelEvent,
  ClinicSettings,
  Doctor,
  Lead,
  Patient,
  Reminder,
  Review,
  SessionRecord,
  StoredUser,
} from '../shared/types'
import {
  appointments as seedAppointments,
  clinicSettings as seedSettings,
  doctors as seedDoctors,
  leads as seedLeads,
  patients as seedPatients,
  reviews as seedReviews,
} from '../shared/fixtures'
import { hashPassword } from './password'
import { config } from './config'
import { connectPglite, connectPostgres, ensureSchema, persistAll, type SqlClient } from './db'

export interface Database {
  version: number
  leads: Lead[]
  patients: Patient[]
  doctors: Doctor[]
  reviews: Review[]
  appointments: Appointment[]
  settings: ClinicSettings
  events: ChannelEvent[]
  users: StoredUser[]
  sessions: SessionRecord[]
  audit: AuditRecord[]
  reminders: Reminder[]
}

/** Версия демо-данных: увеличивается только при изменении фикстур. */
const SEED_VERSION = 3

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

/** Демо-пароль для сидированных сотрудников (меняется через .env). */
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'president2026'

let db: Database | null = null
let sqlClient: SqlClient | null = null
let saveTimer: NodeJS.Timeout | null = null
let flushing = false
let dirty = false

function seedDatabase(): Database {
  const now = new Date().toISOString()

  return {
    version: SEED_VERSION,
    users: [
      {
        id: 'usr-owner',
        name: 'Мадина Ибрагимова',
        email: 'owner@president.ru',
        role: 'owner',
        active: true,
        createdAt: now,
        passwordHash: hashPassword(SEED_PASSWORD),
      },
      {
        id: 'usr-admin',
        name: 'Айшат Батаева',
        email: 'admin@president.ru',
        role: 'admin',
        active: true,
        createdAt: now,
        passwordHash: hashPassword(SEED_PASSWORD),
      },
      {
        id: 'usr-doctor',
        name: 'Исмаилова Мадина Ахмадовна',
        email: 'doctor@president.ru',
        role: 'doctor',
        doctorId: 'doc-1',
        active: true,
        createdAt: now,
        passwordHash: hashPassword(SEED_PASSWORD),
      },
    ],
    sessions: [],
    audit: [],
    reminders: [],
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

function loadJsonDatabase(): Database {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Database

    if (parsed.version !== SEED_VERSION) return seedDatabase()

    parsed.events ??= []
    parsed.users ??= []
    parsed.sessions ??= []
    parsed.audit ??= []
    parsed.reminders ??= []
    return parsed
  } catch {
    return seedDatabase()
  }
}

/**
 * Инициализация хранилища до старта сервера.
 * Драйвер выбирается по DB_DRIVER / DATABASE_URL.
 */
export async function initStore(): Promise<void> {
  const { driver, url, pgliteDir } = config.database

  if (driver === 'json') {
    db = loadJsonDatabase()
    saveDb()
    console.log('[db] json — server/data/db.json')
    return
  }

  const client = driver === 'postgres' ? await connectPostgres(url) : await connectPglite(pgliteDir)
  sqlClient = client
  db = await ensureSchema(client, SEED_VERSION, seedDatabase)

  console.log(
    `[db] ${driver} — загружено: заявок ${db.leads.length}, пациентов ${db.patients.length}, ` +
      `приёмов ${db.appointments.length}, сотрудников ${db.users.length}`,
  )
}

export function getDb(): Database {
  if (!db) throw new Error('Хранилище не инициализировано — вызовите initStore()')
  return db
}

export function storeInfo() {
  return {
    driver: config.database.driver,
    leads: db?.leads.length ?? 0,
    patients: db?.patients.length ?? 0,
    appointments: db?.appointments.length ?? 0,
    users: db?.users.length ?? 0,
  }
}

/** Дебаунс: копим изменения и пишем одним пакетом. */
export function saveDb(): void {
  if (sqlClient) {
    dirty = true
    scheduleSqlFlush()
    return
  }

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(writeJsonFile, 250)
}

function writeJsonFile(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
  } catch (error) {
    console.error('[store] не удалось сохранить базу:', error)
  }
}

function scheduleSqlFlush(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSql(), 120)
}

async function flushSql(): Promise<void> {
  if (!sqlClient || !db) return

  if (flushing) {
    scheduleSqlFlush()
    return
  }
  if (!dirty) return

  flushing = true
  dirty = false

  try {
    await persistAll(sqlClient, db)
  } catch (error) {
    console.error('[db] не удалось сохранить изменения:', error)
    dirty = true
    // пробуем ещё раз через пару секунд, не спамим запросами
    setTimeout(scheduleSqlFlush, 2000)
  } finally {
    flushing = false
  }
}

/** Досохранить всё и закрыть соединение (SIGINT/SIGTERM). */
export async function closeStore(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  if (!db) return

  if (sqlClient) {
    if (db) {
      try {
        await persistAll(sqlClient, db)
      } catch (error) {
        console.error('[db] финальное сохранение не удалось:', error)
      }
    }
    await sqlClient.close()
    sqlClient = null
    return
  }

  writeJsonFile()
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
