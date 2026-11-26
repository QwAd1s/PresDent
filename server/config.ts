import path from 'node:path'

/**
 * .env читаем нативным загрузчиком Node (без dotenv),
 * чтобы не тащить лишнюю зависимость.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  /* .env не обязателен — работаем в мок-режиме */
}

const env = process.env

type DbDriver = 'json' | 'pglite' | 'postgres'

/** Явный DB_DRIVER важнее автоопределения по DATABASE_URL. */
function resolveDriver(): DbDriver {
  const explicit = env.DB_DRIVER?.toLowerCase()
  if (explicit === 'json' || explicit === 'pglite' || explicit === 'postgres') return explicit
  return env.DATABASE_URL ? 'postgres' : 'json'
}

export const config = {
  port: Number(env.PORT ?? 8787),
  publicUrl: env.PUBLIC_URL ?? '',
  /** true — сообщения не уходят в Meta, а логируются (удобно на старте) */
  dryRun: (env.DRY_RUN ?? 'true') !== 'false',
  metaAppSecret: env.META_APP_SECRET ?? '',
  database: {
    driver: resolveDriver(),
    url: env.DATABASE_URL ?? '',
    pgliteDir: env.PGLITE_DIR ?? path.join(process.cwd(), 'server', 'data', 'pglite'),
  },
  whatsapp: {
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? 'president-wa-verify',
    token: env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    apiVersion: 'v21.0',
  },
  instagram: {
    verifyToken: env.INSTAGRAM_VERIFY_TOKEN ?? 'president-ig-verify',
    pageToken: env.INSTAGRAM_PAGE_TOKEN ?? '',
    accountId: env.INSTAGRAM_ACCOUNT_ID ?? '',
    apiVersion: 'v21.0',
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN ?? '',
    /** Чат клиники для уведомлений о новых заявках */
    staffChatId: env.TELEGRAM_STAFF_CHAT_ID ?? '',
    apiBase: 'https://api.telegram.org',
  },
  sms: {
    url: env.SMS_API_URL ?? '',
    apiKey: env.SMS_API_KEY ?? '',
    sender: env.SMS_SENDER ?? 'PresiDent',
  },
  reminders: {
    enabled: (env.REMINDERS_ENABLED ?? 'true') !== 'false',
    tickMs: Number(env.REMINDERS_TICK_MS ?? 60_000),
  },
}

export const isWhatsAppLive = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId)
export const isInstagramLive = () => Boolean(config.instagram.pageToken && config.instagram.accountId)
