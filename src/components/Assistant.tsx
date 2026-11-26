import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AssistantPending, BookingAction, SlotOffer } from '../../shared/assistant'
import { askAssistant, bookAppointment } from '../lib/api'
import { formatTime } from '../lib/format'
import { Icon } from './Icon'
import { PAGE_TITLES } from './Topbar'
import './assistant.css'

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  chips?: string[]
  slots?: SlotOffer[]
  navigate?: string
  at: string
}

const uid = () => Math.random().toString(36).slice(2, 9)
const clock = () => new Date().toISOString()

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

export function Assistant() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [pending, setPending] = useState<AssistantPending | undefined>()

  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const started = useRef(false)
  const typingRef = useRef(false)

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Главная'

  const push = useCallback((item: Omit<ChatItem, 'id' | 'at'>) => {
    setItems((prev) => [...prev, { ...item, id: uid(), at: clock() }])
  }, [])

  const runBooking = useCallback(
    async (payload: Omit<BookingAction, 'type'>) => {
      const result = await bookAppointment({ ...payload, channel: 'phone' })

      if (result.ok && result.appointment) {
        const appointment = result.appointment
        push({
          role: 'assistant',
          text:
            `Готово: ${appointment.patientName} · ${payload.doctorName} · ${dateLabel(appointment.start)} в ` +
            `${formatTime(appointment.start)} · «${appointment.service}». Приём добавлен в расписание, ` +
            'заявка переведена в статус «Записан».',
          chips: ['Открыть расписание', 'Свободные окна на завтра'],
          navigate: '/schedule',
        })
        return true
      }

      push({
        role: 'assistant',
        text: `Не получилось создать запись: ${result.error ?? 'неизвестная ошибка'}. Скажите «свободные окна на завтра» — подберу другое время.`,
        chips: ['Свободные окна на завтра'],
      })
      return false
    },
    [push],
  )

  const send = useCallback(
    async (raw: string, options?: { pending?: AssistantPending; silent?: boolean }) => {
      const text = raw.trim()
      if (!text || typingRef.current) return

      typingRef.current = true
      setInput('')
      if (!options?.silent) push({ role: 'user', text })
      setTyping(true)

      const reply = await askAssistant(text, pageTitle, options?.pending ?? pending)

      setTyping(false)
      typingRef.current = false

      if (reply.action) {
        setPending(undefined)
        setTyping(true)
        typingRef.current = true
        await runBooking({
          patientName: reply.action.patientName,
          patientPhone: reply.action.patientPhone,
          doctorId: reply.action.doctorId,
          doctorName: reply.action.doctorName,
          service: reply.action.service,
          start: reply.action.start,
          durationMin: reply.action.durationMin,
        })
        setTyping(false)
        typingRef.current = false
        return
      }

      push({
        role: 'assistant',
        text: reply.text,
        chips: reply.chips,
        slots: reply.slots,
        navigate: reply.intent === 'greet' ? undefined : reply.navigate,
      })
    },
    [pageTitle, pending, push, runBooking],
  )

  useEffect(() => {
    const openHandler = () => setOpen(true)
    window.addEventListener('assistant:open', openHandler)
    return () => window.removeEventListener('assistant:open', openHandler)
  }, [])

  useEffect(() => {
    if (!open) return

    if (!started.current) {
      started.current = true
      void send('привет', { silent: true })
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [items, typing, open])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickSlot = async (slot: SlotOffer) => {
    if (slot.patientName && typingRef.current === false) {
      push({ role: 'user', text: `Записать ${slot.patientName} на ${slot.label}` })
      setTyping(true)
      typingRef.current = true
      await runBooking({
        patientName: slot.patientName,
        doctorId: slot.doctorId,
        doctorName: slot.doctorName,
        service: slot.service,
        start: slot.start,
        durationMin: slot.durationMin,
      })
      setTyping(false)
      typingRef.current = false
      return
    }

    const nextPending: AssistantPending = {
      doctorId: slot.doctorId,
      start: slot.start,
      service: slot.service,
      durationMin: slot.durationMin,
    }
    setPending(nextPending)
    await send(`Записать на ${slot.label}`, { pending: nextPending })
  }

  const reset = () => {
    setItems([])
    setPending(undefined)
    started.current = false
    void send('привет', { silent: true })
  }

  if (!open) {
    return (
      <button className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Открыть ИИ-админа">
        <span className="assistant-launcher-icon">
          <Icon name="sparkles" size={18} />
        </span>
        <span>
          ИИ-админ
          <small>подскажет и запишет</small>
        </span>
      </button>
    )
  }

  return (
    <section className="assistant-panel" role="dialog" aria-label="ИИ-админ">
      <header className="assistant-head">
        <span className="assistant-avatar">
          <Icon name="sparkles" size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="assistant-title">ИИ-админ</div>
          <div className="assistant-sub">
            <span className="dot live" style={{ boxShadow: 'none' }} />
            Помощник · {pageTitle.toLowerCase()}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="assistant-icon-btn" onClick={reset} aria-label="Начать заново" title="Начать заново">
            <Icon name="refresh" size={16} />
          </button>
          <button className="assistant-icon-btn" onClick={() => setOpen(false)} aria-label="Свернуть">
            <Icon name="x" size={17} />
          </button>
        </div>
      </header>

      <div className="assistant-body" ref={bodyRef}>
        <div className="assistant-day">Сегодня</div>

        {items.map((item) => (
          <div key={item.id} className={`msg-row ${item.role}`}>
            <div className={`msg ${item.role}`}>
              {item.text}
              <span className="msg-time">{formatTime(item.at)}</span>
            </div>

            {item.slots && item.slots.length > 0 && (
              <div className="slot-grid">
                {item.slots.map((slot) => (
                  <button key={slot.id} className="slot-btn" onClick={() => void pickSlot(slot)}>
                    <b>{slot.label}</b>
                    <span>{slot.doctorName.split(' ').slice(0, 2).join(' ')}</span>
                  </button>
                ))}
              </div>
            )}

            {item.chips && item.chips.length > 0 && (
              <div className="chip-row">
                {item.chips.map((chip) => (
                  <button key={chip} className="quick-reply" onClick={() => void send(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {item.navigate && (
              <button
                className="msg-nav"
                onClick={() => {
                  navigate(item.navigate!)
                  setOpen(false)
                }}
              >
                Открыть раздел
                <Icon name="chevronRight" size={13} />
              </button>
            )}
          </div>
        ))}

        {typing && (
          <div className="msg-row assistant">
            <div className="msg assistant typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <footer className="assistant-foot">
        <textarea
          ref={inputRef}
          className="assistant-input"
          rows={1}
          placeholder="Например: запиши Малику на чистку в субботу"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(input)
            }
          }}
        />
        <button
          className="assistant-send"
          onClick={() => void send(input)}
          disabled={!input.trim() || typing}
          aria-label="Отправить"
        >
          <Icon name="send" size={16} />
        </button>
      </footer>
    </section>
  )
}
