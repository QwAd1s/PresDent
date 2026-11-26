import type { Request } from 'express'
import type { AuditEntity, AuditRecord, User } from '../shared/types'
import { getDb, newId, saveDb } from './store'
import { broadcast } from './realtime'

/**
 * Журнал действий: кто, что и когда изменил.
 * Пишем только факты изменений — без персональных данных сверх имени пациента.
 */

const MAX_RECORDS = 800

export function recordAudit(input: {
  user?: Pick<User, 'id' | 'name'> | null
  action: string
  entity: AuditEntity
  entityId?: string
  details?: string
}): AuditRecord {
  const db = getDb()
  const record: AuditRecord = {
    id: newId('audit'),
    at: new Date().toISOString(),
    userId: input.user?.id,
    userName: input.user?.name ?? 'Система',
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    details: input.details,
  }

  db.audit ??= []
  db.audit.unshift(record)
  if (db.audit.length > MAX_RECORDS) db.audit = db.audit.slice(0, MAX_RECORDS)

  saveDb()
  broadcast('audit:new', record)
  return record
}

/** Удобная обёртка для роутов: берёт пользователя из сессии. */
export function auditRequest(
  req: Request,
  action: string,
  entity: AuditEntity,
  entityId?: string,
  details?: string,
): AuditRecord {
  return recordAudit({ user: req.user, action, entity, entityId, details })
}
