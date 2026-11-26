import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Icon } from '../components/Icon'
import './login.css'

const ROLE_NAME: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  doctor: 'Врач',
}

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [email, setEmail] = useState('admin@president.ru')
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (user) return <Navigate to={from} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    const result = await login(email, password)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Не удалось войти')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="login-page">
      <aside className="login-brand">
        <div className="login-brand-top">
          <span className="login-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3.2c-2.2 0-3.1 1-5.1 1C5 4.2 3.4 5.9 3.4 8.6c0 3.4 1.7 6 2.6 8.7.5 1.6.9 3.5 2.2 3.5 1.1 0 1.2-1.7 1.5-3.6.2-1.4.6-2.6 2.3-2.6s2.1 1.2 2.3 2.6c.3 1.9.4 3.6 1.5 3.6 1.3 0 1.7-1.9 2.2-3.5.9-2.7 2.6-5.3 2.6-8.7 0-2.7-1.6-4.4-3.5-4.4-2 0-2.9-1-5.1-1z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div>
            <div className="login-brand-name">PresiDent</div>
            <div className="login-brand-sub">платформа стоматологии</div>
          </div>
        </div>

        <div className="login-brand-body">
          <h1>
            Все обращения клиники
            <br />в одном окне
          </h1>
          <p>
            WhatsApp, Instagram и форма на сайте превращаются в заявки. Администратор отвечает, врач видит
            расписание, владелец — цифры за день.
          </p>

          <ul className="login-features">
            <li>
              <Icon name="inbox" size={17} />
              Единый инбокс заявок с историей диалога
            </li>
            <li>
              <Icon name="calendar" size={17} />
              Расписание врачей и запись в пару кликов
            </li>
            <li>
              <Icon name="sparkles" size={17} />
              ИИ-админ подскажет окно и оформит запись
            </li>
          </ul>
        </div>

        <div className="login-brand-foot">
          <span className="dot live" /> Сервер на связи · данные клиники под защитой
        </div>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-head">
            <h2>Вход в админ-панель</h2>
            <p>Доступ выдаёт владелец клиники. Сессия живёт 7 дней.</p>
          </div>

          <label className="login-field">
            <span>E-mail</span>
            <div className="login-input-wrap">
              <Icon name="user" size={16} />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@president.ru"
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>Пароль</span>
            <div className="login-input-wrap">
              <Icon name="card" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Icon name={showPassword ? 'x' : 'search'} size={15} />
              </button>
            </div>
          </label>

          {error && (
            <div className="login-error" role="alert">
              <Icon name="alert" size={15} />
              {error}
            </div>
          )}

          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? 'Проверяем…' : 'Войти'}
            {!busy && <Icon name="chevronRight" size={16} />}
          </button>

          <div className="login-demo">
            <div className="login-demo-title">Демо-доступ</div>
            <div className="login-demo-hint">
              Пароль у всех: <code>{DEMO_PASSWORD}</code> — аккаунты отличаются правами
            </div>
            <div className="login-demo-list">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={`login-demo-item ${email === account.email ? 'active' : ''}`}
                  onClick={() => {
                    setEmail(account.email)
                    setPassword(DEMO_PASSWORD)
                    setError(null)
                  }}
                >
                  <b>{ROLE_NAME[account.role]}</b>
                  <span>{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="login-legal">
          PresiDent · внутренняя система клиники. Медицинские данные обрабатываются по 152-ФЗ.
        </div>
      </main>
    </div>
  )
}
