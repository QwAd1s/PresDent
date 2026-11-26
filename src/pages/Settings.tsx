import { useEffect, useState } from 'react'
import type { ClinicSettings, Doctor, User, UserRole } from '../../shared/types'
import { ROLE_LABEL, ROLE_SCOPE } from '../../shared/types'
import {
  createUser,
  getDoctors,
  getSettings,
  getTeam,
  logoutOtherSessions,
  resetUserPassword,
  saveSettings,
  updateUser,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { Icon } from '../components/Icon'
import { Avatar, Field, Modal, SkeletonRows, Toggle } from '../components/ui'

const ROLE_COLOR: Record<UserRole, string> = {
  owner: '#0E9E7B',
  admin: '#2F6FED',
  doctor: '#C94B8D',
}

const ROLES: UserRole[] = ['owner', 'admin', 'doctor']

export default function Settings() {
  const { user, changePassword, can } = useAuth()
  const isOwner = can('owner')

  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [team, setTeam] = useState<User[]>([])
  const [online, setOnline] = useState<string[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [teamMessage, setTeamMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null)
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null)

  const reloadTeam = () =>
    getTeam().then((payload) => {
      setTeam(payload.items)
      setOnline(payload.online)
    })

  useEffect(() => {
    void getSettings().then(setSettings)
    void reloadTeam()
    void getDoctors().then((payload) => setDoctors(payload.items))
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

  const submitPassword = async () => {
    if (passwordBusy) return
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Новый пароль должен быть не короче 8 символов' })
      return
    }
    if (newPassword !== repeatPassword) {
      setPasswordMessage({ type: 'error', text: 'Пароли не совпадают' })
      return
    }

    setPasswordBusy(true)
    const result = await changePassword(currentPassword, newPassword)
    setPasswordBusy(false)

    if (!result.ok) {
      setPasswordMessage({ type: 'error', text: result.error ?? 'Не удалось сменить пароль' })
      return
    }

    setPasswordMessage({ type: 'ok', text: 'Пароль обновлён. Остальные сессии завершены.' })
    setCurrentPassword('')
    setNewPassword('')
    setRepeatPassword('')
  }

  const changeRole = async (member: User, role: UserRole) => {
    setBusyUserId(member.id)
    setTeamMessage(null)
    const result = await updateUser(member.id, { role })
    setBusyUserId(null)
    if (!result.ok) {
      setTeamMessage({ type: 'error', text: result.error ?? 'Не удалось изменить роль' })
      return
    }
    setTeamMessage({ type: 'ok', text: `${member.name}: роль изменена на «${ROLE_LABEL[role]}»` })
    await reloadTeam()
  }

  const toggleActive = async (member: User, active: boolean) => {
    setBusyUserId(member.id)
    setTeamMessage(null)
    const result = await updateUser(member.id, { active })
    setBusyUserId(null)
    if (!result.ok) {
      setTeamMessage({ type: 'error', text: result.error ?? 'Не удалось изменить доступ' })
      return
    }
    setTeamMessage({
      type: 'ok',
      text: active ? `Доступ включён: ${member.name}` : `Доступ отключён: ${member.name}. Все сессии завершены.`,
    })
    await reloadTeam()
  }

  const resetPassword = async (member: User) => {
    setBusyUserId(member.id)
    const result = await resetUserPassword(member.id)
    setBusyUserId(null)
    if (!result.ok || !result.password) {
      setTeamMessage({ type: 'error', text: result.error ?? 'Не удалось сбросить пароль' })
      return
    }
    setTempPassword({ email: member.email, password: result.password })
    await reloadTeam()
  }

  const endOtherSessions = async () => {
    const result = await logoutOtherSessions()
    setSessionsMessage(
      result.ok
        ? `Завершено сессий: ${result.ended ?? 0}. Текущее устройство осталось в системе.`
        : (result.error ?? 'Не удалось завершить сессии'),
    )
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
          <div className="page-sub">Профиль клиники, уведомления, доступы и безопасность</div>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontWeight: 550 }}>Напоминание о приёме</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    За сколько часов до визита отправить пациенту сообщение
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 74, textAlign: 'center' }}
                    value={settings.reminderHours ?? 24}
                    onChange={(event) => update({ reminderHours: Number(event.target.value) || 0 })}
                  />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    ч
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
                <div>
                  <div style={{ fontWeight: 550 }}>Запрос отзыва</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Через сколько часов после приёма попросить оценку
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 74, textAlign: 'center' }}
                    value={settings.reviewDelayHours ?? 2}
                    onChange={(event) => update({ reviewDelayHours: Number(event.target.value) || 0 })}
                  />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    ч
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
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
                <div className="card-sub">
                  {team.length} {team.length === 1 ? 'сотрудник' : 'сотрудника'} · сессии живут 7 дней
                </div>
              </div>
              {isOwner && (
                <button className="btn btn-soft btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setInviteOpen(true)}>
                  <Icon name="plus" size={14} />
                  Пригласить
                </button>
              )}
            </div>

            <div className="card-body" style={{ paddingTop: 6 }}>
              {teamMessage && (
                <div
                  className={teamMessage.type === 'ok' ? 'hint-box' : 'hint-box warn'}
                  style={
                    teamMessage.type === 'ok'
                      ? { background: 'var(--brand-soft)', borderColor: '#cdeee2', color: '#0a5c45', marginBottom: 10 }
                      : { marginBottom: 10 }
                  }
                >
                  <Icon name={teamMessage.type === 'ok' ? 'check' : 'alert'} size={15} />
                  <div>{teamMessage.text}</div>
                </div>
              )}

              {team.map((member) => {
                const isOnline = online.includes(member.id)
                const isSelf = member.id === user?.id
                const inactive = member.active === false
                const isBusy = busyUserId === member.id
                const doctorName = member.doctorId ? doctors.find((doctor) => doctor.id === member.doctorId)?.name : null

                return (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '10px 0',
                      borderBottom: '1px dashed var(--line)',
                      opacity: inactive ? 0.55 : 1,
                    }}
                  >
                    <span style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar name={member.name} size={34} color={ROLE_COLOR[member.role]} />
                      {isOnline && !inactive && (
                        <span
                          title="В системе"
                          style={{
                            position: 'absolute',
                            right: -1,
                            bottom: -1,
                            width: 10,
                            height: 10,
                            borderRadius: 99,
                            background: 'var(--brand)',
                            border: '2px solid #fff',
                          }}
                        />
                      )}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {member.name}
                        {isSelf && <span className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}> · это вы</span>}
                        {inactive && <span className="badge status-spam" style={{ marginLeft: 6 }}>доступ отключён</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {member.email}
                        {doctorName ? ` · ${doctorName}` : ''}
                      </div>
                      {isOwner && !isSelf ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                          <select
                            className="select"
                            style={{ height: 28, fontSize: 12, padding: '0 6px' }}
                            value={member.role}
                            disabled={isBusy}
                            onChange={(event) => void changeRole(member, event.target.value as UserRole)}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                          <button
                            className={`btn btn-sm ${inactive ? 'btn-soft' : 'btn-ghost'}`}
                            style={{ height: 28, fontSize: 12 }}
                            disabled={isBusy}
                            onClick={() => void toggleActive(member, inactive)}
                          >
                            {inactive ? 'Включить доступ' : 'Отключить'}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ height: 28, fontSize: 12 }}
                            disabled={isBusy}
                            onClick={() => void resetPassword(member)}
                          >
                            Сбросить пароль
                          </button>
                        </div>
                      ) : (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {ROLE_LABEL[member.role]} · {ROLE_SCOPE[member.role]}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="hint-box" style={{ marginTop: 12 }}>
                <Icon name="alert" size={15} />
                <div>
                  {isOwner
                    ? 'Все действия с доступами попадают в журнал. Отключение сотрудника сразу завершает его сессии.'
                    : 'Управлять ролями и доступами может только владелец клиники.'}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Безопасность</div>
                <div className="card-sub">Пароль для аккаунта {user?.email}</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              <Field label="Текущий пароль">
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Новый пароль">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="минимум 8 символов"
                  />
                </Field>
                <Field label="Повторите">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={repeatPassword}
                    onChange={(event) => setRepeatPassword(event.target.value)}
                    placeholder="ещё раз"
                  />
                </Field>
              </div>

              {passwordMessage && (
                <div
                  className="hint-box"
                  style={
                    passwordMessage.type === 'ok'
                      ? { background: 'var(--brand-soft)', borderColor: '#cdeee2', color: '#0a5c45' }
                      : undefined
                  }
                >
                  <Icon name={passwordMessage.type === 'ok' ? 'check' : 'alert'} size={15} />
                  <div>{passwordMessage.text}</div>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ justifySelf: 'start' }}
                disabled={passwordBusy || !currentPassword || !newPassword}
                onClick={() => void submitPassword()}
              >
                <Icon name="card" size={15} />
                {passwordBusy ? 'Меняем…' : 'Сменить пароль'}
              </button>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>Активные сессии</div>
                <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  Если заходили с чужого устройства или потеряли ноутбук — завершите остальные сессии. Текущее
                  устройство останется в системе.
                </div>
                <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => void endOtherSessions()}>
                  <Icon name="logout" size={14} />
                  Выйти на всех устройствах
                </button>
                {sessionsMessage && <div className="muted" style={{ fontSize: 11.5 }}>{sessionsMessage}</div>}
              </div>

              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                Пароли хранятся в виде scrypt-хеша, сессии — httpOnly cookie. Смена пароля завершает все остальные
                сессии сотрудника.
              </div>
            </div>
          </section>
        </div>
      </div>

      {inviteOpen && (
        <InviteModal
          doctors={doctors}
          onClose={() => setInviteOpen(false)}
          onInvited={async (email, password) => {
            setInviteOpen(false)
            await reloadTeam()
            setTeamMessage({ type: 'ok', text: `Сотрудник приглашён: ${email}` })
            if (password) setTempPassword({ email, password })
          }}
        />
      )}

      {tempPassword && (
        <Modal
          title="Временный пароль"
          subtitle={`Передайте его сотруднику: ${tempPassword.email}`}
          onClose={() => setTempPassword(null)}
          footer={
            <button className="btn btn-primary" onClick={() => setTempPassword(null)}>
              Готово
            </button>
          }
        >
          <div className="code-line" style={{ fontSize: 15, padding: '14px 16px' }}>
            <span style={{ letterSpacing: '0.04em', fontWeight: 600 }}>{tempPassword.password}</span>
            <button
              className="copy"
              aria-label="Скопировать"
              onClick={() => void navigator.clipboard.writeText(tempPassword.password)}
            >
              <Icon name="copy" size={15} />
            </button>
          </div>
          <div className="hint-box warn">
            <Icon name="alert" size={15} />
            <div>
              Пароль показывается один раз. Сотрудник сможет сменить его в «Настройках» после входа; до этого момента
              вход по старому паролю невозможен.
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function InviteModal({
  doctors,
  onClose,
  onInvited,
}: {
  doctors: Doctor[]
  onClose: () => void
  onInvited: (email: string, temporaryPassword?: string) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('admin')
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (name.trim().length < 2) {
      setError('Укажите имя сотрудника')
      return
    }
    if (!email.includes('@')) {
      setError('Укажите корректный e-mail')
      return
    }
    if (role === 'doctor' && !doctorId) {
      setError('Выберите врача из справочника')
      return
    }
    if (password && password.length < 8) {
      setError('Пароль должен быть не короче 8 символов')
      return
    }

    setBusy(true)
    setError(null)
    const result = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      doctorId: role === 'doctor' ? doctorId : undefined,
      password: password || undefined,
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось создать сотрудника')
      return
    }

    await onInvited(email.trim().toLowerCase(), result.temporaryPassword)
  }

  return (
    <Modal
      title="Новый сотрудник"
      subtitle="Доступ выдаётся сразу, пароль можно сгенерировать автоматически"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            <Icon name="plus" size={15} />
            {busy ? 'Создаём…' : 'Пригласить'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Имя и фамилия">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Айшат Батаева" />
        </Field>
        <Field label="E-mail">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@president.ru"
          />
        </Field>
        <Field label="Роль" hint={ROLE_SCOPE[role]}>
          <select className="select" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
        {role === 'doctor' ? (
          <Field label="Врач">
            <select className="select" value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Пароль" hint="Пусто — сгенерируем временный">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="минимум 8 символов"
            />
          </Field>
        )}
      </div>

      {role === 'doctor' && (
        <Field label="Пароль" hint="Пусто — сгенерируем временный">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="минимум 8 символов"
          />
        </Field>
      )}

      {error && (
        <div className="hint-box warn">
          <Icon name="alert" size={15} />
          <div>{error}</div>
        </div>
      )}
    </Modal>
  )
}
