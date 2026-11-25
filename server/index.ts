import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { router } from './routes'
import { config } from './config'

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

app.listen(config.port, () => {
  console.log(`\n  PresiDent API → http://127.0.0.1:${config.port}`)
  console.log(`  Режим отправки: ${config.dryRun ? 'DRY_RUN (сообщения только логируются)' : 'LIVE'}`)
  console.log(`  WhatsApp: ${config.whatsapp.token ? 'токен задан' : 'демо'} | Instagram: ${config.instagram.pageToken ? 'токен задан' : 'демо'}`)
  console.log(`  Вебхук WA: ${config.publicUrl || 'http://127.0.0.1:' + config.port}/api/webhooks/whatsapp\n`)
})
