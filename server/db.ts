import type { Database } from './store'
import { clinicSettings } from '../shared/fixtures'
import { config } from './config'

/**
 * Хранилище на PostgreSQL.
 *
 * Модель: одна таблица `entities (type, id, ord, data jsonb)` — «документный» слой.
 * Для клиники этого достаточно: данные атомарно пишутся в настоящую БД, переживают
 * рестарт и деплой, читаются из памяти процесса (быстро) и сохраняются диффом.
 *
 * Драйверы:
 *  - postgres — обычный сервер (`pg`, DATABASE_URL);
 *  - pglite   — настоящий Postgres в WASM (локальная разработка и тесты без сервера).
 *
 * Когда появятся отчёты по 100k+ строк — таблицы нормализуются, а API репозиториев
 * поменяется точечно: маршруты уже работают через getDb().
 */

export type Driver = 'json' | 'pglite' | 'postgres'

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  close(): Promise<void>
}

/**
 * DDL по одному запросу: PGlite не принимает несколько команд в одном
 * prepared statement (обычный Postgres принял бы).
 */
const DDL: string[] = [
  `create table if not exists entities (
    type text not null,
    id text not null,
    ord integer not null default 0,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (type, id)
  )`,
  'create index if not exists entities_type_ord_idx on entities (type, ord)',
  `create table if not exists meta (
    key text primary key,
    value text not null
  )`,
]

export async function connectPostgres(url: string): Promise<SqlClient> {
  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: /sslmode=require|sslmode=verify/i.test(url) ? { rejectUnauthorized: false } : undefined,
  })

  const client = await pool.connect()
  client.release()

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params as never[])
      return { rows: result.rows as T[] }
    },
    close: () => pool.end(),
  }
}

export async function connectPglite(dir: string): Promise<SqlClient> {
  const { PGlite } = await import('@electric-sql/pglite')
  const instance = new PGlite(dir)
  await instance.waitReady

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await instance.query<T>(sql, params as never[])
      return { rows: result.rows }
    },
    close: () => instance.close(),
  }
}

// ─── Загрузка / сохранение ──────────────────────────────────────────────────

interface Entry {
  type: string
  id: string
  ord: number
  json: string
}

/** Последнее сохранённое состояние: по нему считаем дифф. */
let snapshot = new Map<string, string>()

const keyOf = (type: string, id: string) => `${type}:${id}`

function collect(db: Database): Entry[] {
  const entries: Entry[] = []

  const push = <T extends { id: string }>(type: string, items: T[]) => {
    items.forEach((item, index) => {
      entries.push({ type, id: item.id, ord: index, json: JSON.stringify(item) })
    })
  }

  push('lead', db.leads)
  push('patient', db.patients)
  push('doctor', db.doctors)
  push('review', db.reviews)
  push('appointment', db.appointments)
  push('event', db.events)
  push('user', db.users)
  push('session', db.sessions)
  push('audit', db.audit)
  push('reminder', db.reminders)
  push('service', db.services)
  entries.push({ type: 'settings', id: 'clinic', ord: 0, json: JSON.stringify(db.settings) })

  return entries
}

function emptyDatabase(version: number, settings: Database['settings']): Database {
  return {
    version,
    leads: [],
    patients: [],
    doctors: [],
    reviews: [],
    appointments: [],
    settings,
    events: [],
    users: [],
    sessions: [],
    audit: [],
    reminders: [],
    services: [],
  }
}

export async function loadAll(
  client: SqlClient,
  version: number,
  fallbackSettings: Database['settings'],
): Promise<Database> {
  const result = await client.query<{ type: string; data: unknown }>(
    'select type, data from entities order by type, ord asc, id asc',
  )

  const db = emptyDatabase(version, fallbackSettings)

  for (const row of result.rows) {
    const data = row.data as Record<string, unknown>
    switch (row.type) {
      case 'lead':
        db.leads.push(data as unknown as Database['leads'][number])
        break
      case 'patient':
        db.patients.push(data as unknown as Database['patients'][number])
        break
      case 'doctor':
        db.doctors.push(data as unknown as Database['doctors'][number])
        break
      case 'review':
        db.reviews.push(data as unknown as Database['reviews'][number])
        break
      case 'appointment':
        db.appointments.push(data as unknown as Database['appointments'][number])
        break
      case 'event':
        db.events.push(data as unknown as Database['events'][number])
        break
      case 'user':
        db.users.push(data as unknown as Database['users'][number])
        break
      case 'session':
        db.sessions.push(data as unknown as Database['sessions'][number])
        break
      case 'audit':
        db.audit.push(data as unknown as Database['audit'][number])
        break
      case 'reminder':
        db.reminders.push(data as unknown as Database['reminders'][number])
        break
      case 'service':
        db.services.push(data as unknown as Database['services'][number])
        break
      case 'settings':
        db.settings = data as unknown as Database['settings']
        break
      default:
        break
    }
  }

  return db
}

/** Полная перезапись — только при первичном сидировании пустой базы. */
async function replaceAll(client: SqlClient, db: Database): Promise<void> {
  await client.query('begin')
  try {
    await client.query('delete from entities')
    for (const entry of collect(db)) {
      await client.query(
        'insert into entities (type, id, ord, data) values ($1, $2, $3, $4::jsonb)',
        [entry.type, entry.id, entry.ord, entry.json],
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }

  snapshot = new Map(collect(db).map((entry) => [keyOf(entry.type, entry.id), entry.json]))
}

/** Применяет к базе только изменённые сущности — одна транзакция. */
export async function persistAll(client: SqlClient, db: Database): Promise<void> {
  const entries = collect(db)
  const next = new Map<string, string>()
  const upserts: Entry[] = []

  for (const entry of entries) {
    const key = keyOf(entry.type, entry.id)
    next.set(key, entry.json)
    if (snapshot.get(key) !== entry.json) upserts.push(entry)
  }

  const deletes: string[] = []
  for (const key of snapshot.keys()) {
    if (!next.has(key)) deletes.push(key)
  }

  if (!upserts.length && !deletes.length) return

  await client.query('begin')
  try {
    for (const key of deletes) {
      const [type, id] = key.split(':')
      await client.query('delete from entities where type = $1 and id = $2', [type, id])
    }

    for (const entry of upserts) {
      await client.query(
        `insert into entities (type, id, ord, data, updated_at) values ($1, $2, $3, $4::jsonb, now())
         on conflict (type, id) do update set data = excluded.data, ord = excluded.ord, updated_at = now()`,
        [entry.type, entry.id, entry.ord, entry.json],
      )
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }

  snapshot = next
}

/** Схема + сид пустой базы. Существующие данные не перетираем никогда. */
export async function ensureSchema(
  client: SqlClient,
  version: number,
  seedFactory: () => Database,
): Promise<Database> {
  for (const statement of DDL) {
    await client.query(statement)
  }

  const countResult = await client.query<{ count: number }>('select count(*)::int as count from entities')
  const total = Number(countResult.rows[0]?.count ?? 0)

  if (total === 0 || config.seedReset) {
    const seeded = seedFactory()
    await replaceAll(client, seeded)
    await client.query(
      'insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
      ['seed_version', String(version)],
    )
    console.log(`[db] пустая база: загружены демо-данные (версия ${version})`)
    return seeded
  }

  const versionResult = await client.query<{ value: string }>('select value from meta where key = $1', [
    'seed_version',
  ])
  const storedVersion = Number(versionResult.rows[0]?.value ?? 0)
  if (storedVersion !== version) {
    console.warn(
      `[db] данные созданы версией ${storedVersion}, текущая ${version} — оставляем как есть, сид не применяем`,
    )
  }

  const db = await loadAll(client, version, structuredClone(clinicSettings))
  snapshot = new Map(collect(db).map((entry) => [keyOf(entry.type, entry.id), entry.json]))
  return db
}
