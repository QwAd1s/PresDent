import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { router } from './routes'
import { config } from './config'
import { closeStore, initStore, storeInfo } from './store'
import { startReminderScheduler, stopReminderScheduler } from './reminders'

try {
  await initStore()
} catch (error) {
  console.error('[db] не удалось инициализировать хранилище:', error)
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')

// body + rawBody (нужен для проверки подписи Meta)
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      ;(req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8')
    },
  }),
)

// В dev фронтенд живёт на 5173 и проксирует /api, но CORS не помешает
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.header('origin') ?? '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.use('/api', router)

// Прод: отдаём собранный Vite-фронтенд с того же порта
const distDir = path.join(process.cwd(), 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] необработанная ошибка:', error)
  if (!res.headersSent) res.status(500).json({ error: 'Внутренняя ошибка сервера' })
})

const server = app.listen(config.port, () => {
  const storage = storeInfo()
  console.log(`\n  PresiDent API → http://127.0.0.1:${config.port}`)
  console.log(`  Хранилище: ${storage.driver} · заявок ${storage.leads} · пациентов ${storage.patients} · сотрудников ${storage.users}`)
  console.log(`  Режим отправки: ${config.dryRun ? 'DRY_RUN (сообщения только логируются)' : 'LIVE'}`)
  console.log(`  WhatsApp: ${config.whatsapp.token ? 'токен задан' : 'демо'} | Instagram: ${config.instagram.pageToken ? 'токен задан' : 'демо'}`)
  console.log(`  Вебхук WA: ${config.publicUrl || 'http://127.0.0.1:' + config.port}/api/webhooks/whatsapp\n`)

  if (config.reminders.enabled) {
    startReminderScheduler(config.reminders.tickMs)
  }
})

let stopping = false

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[api] ${signal}: сохраняем данные и останавливаемся…`)

  stopReminderScheduler()
  server.close()
  try {
    await closeStore()
    console.log('[api] данные сохранены')
  } catch (error) {
    console.error('[api] ошибка при закрытии хранилища:', error)
  }
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
