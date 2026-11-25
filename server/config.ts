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

export const config = {
  port: Number(env.PORT ?? 8787),
  publicUrl: env.PUBLIC_URL ?? '',
  /** true — сообщения не уходят в Meta, а логируются (удобно на старте) */
  dryRun: (env.DRY_RUN ?? 'true') !== 'false',
  metaAppSecret: env.META_APP_SECRET ?? '',
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
}

export const isWhatsAppLive = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId)
export const isInstagramLive = () => Boolean(config.instagram.pageToken && config.instagram.accountId)
