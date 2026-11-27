import { useEffect, useState } from 'react'
import type { Service } from '../../shared/services'
import { formatPrice } from '../../shared/services'
import { createService, getServices, updateService } from '../lib/api'
import { Icon } from '../components/Icon'
import { EmptyState, Field, Modal, SkeletonRows, Toggle } from '../components/ui'

const SPECIALTIES = [
  { value: 'терапевт', label: 'Врач-терапевт' },
  { value: 'гигиен', label: 'Гигиенист' },
  { value: 'имплант', label: 'Хирург-имплантолог' },
  { value: 'ортодонт', label: 'Ортодонт' },
  { value: 'ортопед', label: 'Ортопед' },
  { value: 'детск', label: 'Детский стоматолог' },
]

export default function Services() {
  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    void getServices().then((payload) => {
      setItems(payload.items)
      setLoading(false)
    })
  }

  useEffect(load, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const toggleActive = async (service: Service) => {
    setBusyId(service.id)
    const result = await updateService(service.id, { active: service.active === false })
    setBusyId(null)
    if (!result.ok) {
      setToast(result.error ?? 'Не удалось обновить услугу')
      return
    }
    setItems((current) => current.map((item) => (item.id === result.service!.id ? result.service! : item)))
    setToast(service.active === false ? 'Услуга снова на сайте' : 'Услуга скрыта с сайта')
  }

  const activeCount = items.filter((item) => item.active !== false).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Услуги и цены</h1>
          <div className="page-sub">
            {items.length} услуг · {activeCount} показываются на сайте
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={15} />
            Обновить
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            Добавить услугу
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="hint-box"
          style={{ marginBottom: 14, background: 'var(--brand-soft)', borderColor: '#cdeee2', color: '#0a5c45' }}
        >
          <Icon name="check" size={16} />
          <div>{toast}</div>
        </div>
      )}

      <section className="card">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Услуга</th>
                  <th style={{ width: 140 }}>Категория</th>
                  <th style={{ width: 120 }} className="t-right">
                    Цена
                  </th>
                  <th style={{ width: 110 }}>Длительность</th>
                  <th style={{ width: 170 }}>Специализация</th>
                  <th style={{ width: 130 }}>На сайте</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((service) => (
                  <tr key={service.id} style={{ cursor: 'default', opacity: service.active === false ? 0.55 : 1 }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{service.title}</div>
                      {service.description && (
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {service.description}
                        </div>
                      )}
                    </td>
                    <td className="muted">{service.category}</td>
                    <td className="t-right nowrap" style={{ fontWeight: 600 }}>
                      {formatPrice(service.price)}
                    </td>
                    <td className="muted nowrap">{service.durationMin} мин</td>
                    <td className="muted">
                      {SPECIALTIES.find((item) => item.value === service.specialty)?.label ?? service.specialty}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Toggle
                          checked={service.active !== false}
                          onChange={() => void toggleActive(service)}
                        />
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          {busyId === service.id ? '…' : service.active === false ? 'скрыта' : 'видна'}
                        </span>
                      </div>
                    </td>
                    <td className="t-right">
                      <button className="icon-btn" onClick={() => setEditing(service)} aria-label="Изменить">
                        <Icon name="edit" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Услуг пока нет"
            text="Добавьте первую услугу — она сразу появится на сайте и в форме записи."
            icon="card"
          />
        )}
      </section>

      {editing && (
        <ServiceModal
          service={editing === 'new' ? null : editing}
          categories={Array.from(new Set(items.map((item) => item.category)))}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setToast(message)
            load()
          }}
        />
      )}
    </>
  )
}

function ServiceModal({
  service,
  categories,
  onClose,
  onSaved,
}: {
  service: Service | null
  categories: string[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [title, setTitle] = useState(service?.title ?? '')
  const [category, setCategory] = useState(service?.category ?? '')
  const [price, setPrice] = useState(String(service?.price ?? ''))
  const [durationMin, setDurationMin] = useState(String(service?.durationMin ?? 60))
  const [specialty, setSpecialty] = useState(service?.specialty ?? 'терапевт')
  const [description, setDescription] = useState(service?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (title.trim().length < 2) {
      setError('Укажите название услуги')
      return
    }
    if (!category.trim()) {
      setError('Укажите категорию')
      return
    }

    setBusy(true)
    setError(null)

    const payload = {
      title: title.trim(),
      category: category.trim(),
      price: Number(price) || 0,
      durationMin: Number(durationMin) || 30,
      specialty,
      description: description.trim() || undefined,
    }

    const result = service
      ? await updateService(service.id, payload)
      : await createService(payload)

    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось сохранить услугу')
      return
    }

    onSaved(service ? `Услуга обновлена: ${payload.title}` : `Услуга добавлена: ${payload.title}`)
  }

  return (
    <Modal
      title={service ? 'Изменить услугу' : 'Новая услуга'}
      subtitle="Цена и длительность сразу учитываются в записи и на сайте"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            <Icon name="check" size={15} />
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Название">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Гигиена и чистка" />
        </Field>
        <Field label="Категория">
          <input
            className="input"
            list="service-categories"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Гигиена"
          />
          <datalist id="service-categories">
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
        <Field label="Цена, ₽">
          <input
            className="input"
            type="number"
            min="0"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="6500"
          />
        </Field>
        <Field label="Длительность, мин">
          <input
            className="input"
            type="number"
            min="10"
            max="480"
            step="5"
            value={durationMin}
            onChange={(event) => setDurationMin(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Специализация врача" hint="По ней подбирается врач при записи">
        <select className="select" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
          {SPECIALTIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Описание">
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Что входит в услугу"
        />
      </Field>

      {error && (
        <div className="hint-box warn">
          <Icon name="alert" size={15} />
          <div>{error}</div>
        </div>
      )}
    </Modal>
  )
}
