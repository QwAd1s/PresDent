import { NavLink, useNavigate } from 'react-router-dom'
import { ROLE_LABEL } from '../../shared/types'
import { useAuth } from '../lib/auth'
import { Icon, type IconName } from './Icon'
import { Avatar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: IconName
  badge?: number
  hot?: boolean
  end?: boolean
}

interface SidebarProps {
  newLeads: number
  unansweredReviews: number
}

export function Sidebar({ newLeads, unansweredReviews }: SidebarProps) {
  const { user, logout, can } = useAuth()
  const navigate = useNavigate()
  const staff = can('owner', 'admin')

  const mainNav: NavItem[] = [
    ...(staff
      ? ([
          { to: '/', label: 'Главная', icon: 'home', end: true },
          { to: '/leads', label: 'Заявки', icon: 'inbox', badge: newLeads || undefined, hot: true },
        ] as NavItem[])
      : []),
    { to: '/patients', label: 'База пациентов', icon: 'users' },
    { to: '/doctors', label: 'Врачи', icon: 'doctor' },
    { to: '/schedule', label: 'Расписание', icon: 'calendar' },
    { to: '/reviews', label: 'Отзывы', icon: 'star', badge: unansweredReviews || undefined },
  ]

  const extraNav: NavItem[] = staff
    ? [
        { to: '/channels', label: 'Каналы и интеграции', icon: 'plug' },
        { to: '/reminders', label: 'Напоминания', icon: 'bell' },
        { to: '/audit', label: 'Журнал действий', icon: 'clock' },
        { to: '/settings', label: 'Настройки', icon: 'settings' },
      ]
    : []

  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      title={item.label}
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
      {Boolean(item.badge) && <span className={`nav-badge ${item.hot ? 'hot' : ''}`}>{item.badge}</span>}
    </NavLink>
  )

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3.2c-2.2 0-3.1 1-5.1 1C5 4.2 3.4 5.9 3.4 8.6c0 3.4 1.7 6 2.6 8.7.5 1.6.9 3.5 2.2 3.5 1.1 0 1.2-1.7 1.5-3.6.2-1.4.6-2.6 2.3-2.6s2.1 1.2 2.3 2.6c.3 1.9.4 3.6 1.5 3.6 1.3 0 1.7-1.9 2.2-3.5.9-2.7 2.6-5.3 2.6-8.7 0-2.7-1.6-4.4-3.5-4.4-2 0-2.9-1-5.1-1z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className="brand-text">
          <div className="brand-name">PresiDent</div>
          <div className="brand-sub">CRM клиники</div>
        </div>
      </div>

      <nav className="nav-scroll">
        <div className="nav-group-label">Клиника</div>
        {mainNav.map(renderItem)}

        {extraNav.length > 0 && (
          <>
            <div className="nav-group-label">Интеграции</div>
            {extraNav.map(renderItem)}
          </>
        )}

        {staff && (
          <>
            <div className="nav-group-label">Публичное</div>
            <a className="nav-item" href="/site" target="_blank" rel="noreferrer" title="Сайт клиники">
              <Icon name="globe" size={18} />
              <span>Сайт клиники</span>
            </a>

            <div className="nav-group-label">Состояние каналов</div>
            <div className="channel-mini">
              <span className="dot live" />
              WhatsApp · онлайн
            </div>
            <div className="channel-mini">
              <span className="dot live" />
              Instagram · онлайн
            </div>
            <div className="channel-mini">
              <span className="dot demo" />
              Сайт · форма
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <Avatar name={user?.name ?? 'Гость'} size={32} color="#14b98f" />
          <div style={{ minWidth: 0 }}>
            <div className="name">{user?.name ?? 'Гость'}</div>
            <div className="role">{user ? ROLE_LABEL[user.role] : '—'}</div>
          </div>
          <button
            className="icon-btn"
            style={{ marginLeft: 'auto', width: 30, height: 30, color: '#8fa8b1' }}
            title="Выйти"
            aria-label="Выйти из аккаунта"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
