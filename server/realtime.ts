import type { Response } from 'express'

/**
 * Простейший SSE-хаб: админка подписывается на /api/events
 * и получает новые заявки/сообщения без перезагрузки страницы.
 */
const clients = new Set<Response>()

export function addClient(res: Response): void {
  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function broadcast(event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of clients) {
    try {
      client.write(frame)
    } catch {
      clients.delete(client)
    }
  }
}

export const clientsCount = () => clients.size
