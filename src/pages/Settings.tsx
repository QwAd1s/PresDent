import { useEffect, useState } from 'react'
import type { ClinicSettings } from '../../shared/types'
import { getSettings, saveSettings } from '../lib/api'
import { Icon } from '../components/Icon'
import { Avatar, Field, SkeletonRows, Toggle } from '../components/ui'

const TEAM = [
  { name: 'Мадина Ибрагимова', role: 'Администратор', access: 'Полный доступ', color: '#0E9E7B' },
  { name: 'Айшат Батаева', role: 'Старший администратор', access: 'Заявки, пациенты, расписание', color: '#2F6FED' },
  { name: 'Исмаилова Мадина', role: 'Врач-терапевт', access: 'Своё расписание и пациенты', color: '#C94B8D' },
  { name: 'Магомадов Турпал', role: 'Хирург-имплантолог', access: 'Своё расписание и пациенты', color: '#8A5CF6' },
]

export default function Settings() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  const update = (patch: Partial<ClinicSettings>) =>
    setSettings((current) => (current ? { ...current, ...patch } : current))

  const save = async () => {
    if (!settings || busy) return
    setBusy(true)
    const result = await saveSettings(settings)
    setSettings(result)
    setBusy(false)
    setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    setTimeout(() => setSavedAt(null), 3000)
  }

  if (!settings) {
    return (
      <div className="card">
        <SkeletonRows rows={6} />
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Настройки</h1>
          <div className="page-sub">Профиль клиники, уведомления и доступы сотрудников</div>
        </div>
        <div className="page-actions">
          {savedAt && (
            <span className="badge status-booked">
              <Icon name="check" size={12} />
              Сохранено в {savedAt}
            </span>
          )}
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <Icon name="check" size={15} />
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Профиль клиники</div>
                <div className="card-sub">Отображается в ответах пациентам и на сайте</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <Field label="Название">
                <input className="input" value={settings.name} onChange={(event) => update({ name: event.target.value })} />
              </Field>
              <Field label="Адрес">
                <input className="input" value={settings.address} onChange={(event) => update({ address: event.target.value })} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Телефон">
                  <input className="input" value={settings.phone} onChange={(event) => update({ phone: event.target.value })} />
                </Field>
                <Field label="E-mail">
                  <input className="input" value={settings.email} onChange={(event) => update({ email: event.target.value })} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Часы работы">
                  <input className="input" value={settings.workHours} onChange={(event) => update({ workHours: event.target.value })} />
                </Field>
                <Field label="Часовой пояс">
                  <select
                    className="select"
                    value={settings.timezone}
                    onChange={(event) => update({ timezone: event.target.value })}
                  >
                    <option value="Europe/Moscow">Москва (UTC+3)</option>
                    <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
                    <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
                  </select>
                </Field>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Уведомления и SLA</div>
                <div className="card-sub">Как платформа реагирует на новые обращения</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 4 }}>
              {[
                {
                  key: 'autoAssign' as const,
                  title: 'Автораспределение заявок',
                  text: 'Новые обращения автоматически закрепляются за свободным администратором',
                },
                {
                  key: 'notifyWhatsapp' as const,
                  title: 'Дублировать в WhatsApp',
                  text: 'Присылать уведомление о новой заявке в рабочий чат клиники',
                },
                {
                  key: 'notifyEmail' as const,
                  title: 'Письмо на e-mail',
                  text: 'Копия заявки на почту администратора',
                },
              ].map((item) => (
                <div
                  key={item.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}
                >
                  <div>
                    <div style={{ fontWeight: 550 }}>{item.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {item.text}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto' }}>
                    <Toggle checked={settings[item.key]} onChange={(value) => update({ [item.key]: value })} />
                  </span>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
                <div>
                  <div style={{ fontWeight: 550 }}>Норма первого ответа</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Если не ответили вовремя — заявка подсвечивается красным
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 74, textAlign: 'center' }}
                    value={settings.firstResponseMinutes}
                    onChange={(event) => update({ firstResponseMinutes: Number(event.target.value) || 0 })}
                  />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    мин
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Команда и доступы</div>
                <div className="card-sub">4 сотрудника</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {TEAM.map((member) => (
                <div key={member.name} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px dashed var(--line)' }}>
                  <Avatar name={member.name} size={34} color={member.color} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{member.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {member.role} · {member.access}
                    </div>
                  </div>
                  <button className="icon-btn" style={{ marginLeft: 'auto', width: 30, height: 30 }} aria-label="Изменить доступ">
                    <Icon name="more" size={15} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 12 }}>
                <Icon name="plus" size={14} />
                Пригласить сотрудника
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Данные и безопасность</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 10, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <div style={{ display: 'flex', gap: 9 }}>
                <Icon name="check" size={15} style={{ color: 'var(--brand)' }} />
                Медицинские данные хранятся в РФ, доступ — по ролям
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <Icon name="check" size={15} style={{ color: 'var(--brand)' }} />
                Все действия администраторов пишутся в журнал
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <Icon name="check" size={15} style={{ color: 'var(--brand)' }} />
                Резервная копия базы — каждую ночь
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                <Icon name="card" size={14} />
                Скачать архив данных
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
