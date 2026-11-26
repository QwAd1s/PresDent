import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { Avatar } from './ui'

export const PAGE_TITLES: Record<string, string> = {
  '/': 'Главная',
  '/leads': 'Заявки',
  '/patients': 'База пациентов',
  '/doctors': 'Врачи',
  '/schedule': 'Расписание',
  '/reviews': 'Отзывы',
  '/channels': 'Каналы и интеграции',
  '/settings': 'Настройки',
}

export function Topbar({ demoMode, newLeads }: { demoMode: boolean; newLeads: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  const title = PAGE_TITLES[location.pathname] ?? 'Админ-панель'

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Админ-панель</span>
        <Icon name="chevronRight" size={13} />
        <b>{title}</b>
      </div>

      {demoMode && (
        <span className="demo-chip" title="API недоступен — данные из демо-хранилища браузера">
          <span className="dot demo" />
          Демо-режим
        </span>
      )}

      <div className="search">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Поиск по заявкам и пациентам"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && query.trim()) {
              navigate(`/leads?q=${encodeURIComponent(query.trim())}`)
              setQuery('')
            }
          }}
        />
        <kbd>Ctrl K</kbd>
      </div>

      <button className="icon-btn" onClick={() => navigate('/leads?status=new')} aria-label="Новые заявки">
        <Icon name="bell" size={18} />
        {newLeads > 0 && <span className="ping" />}
      </button>

      <div className="avatar-top">
        <Avatar name="Мадина Ибрагимова" size={34} color="#0E9E7B" />
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Мадина Ибрагимова</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Администратор</div>
        </div>
      </div>
    </header>
  )
}
