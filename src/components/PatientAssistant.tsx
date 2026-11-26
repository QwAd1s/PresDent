import { useEffect, useRef, useState } from 'react'
import type { PatientReply, PatientSlot } from '../../shared/patient-assistant'
import { askPatientAssistant } from '../lib/public-api'
import { Icon } from './Icon'
import './patient-assistant.css'

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  chips?: string[]
  slots?: PatientSlot[]
}

export interface BookingPrefill {
  service?: string
  doctorId?: string
  date?: string
  start?: string
}

const OPENING: ChatItem = {
  id: 'opening',
  role: 'assistant',
  text:
    'Здравствуйте! Я помощник клиники PresiDent. Подскажу цены, врачей и свободное время — и помогу записаться на приём.',
  chips: ['Услуги и цены', 'Свободное время', 'Подготовка к приёму', 'Адрес и часы'],
}

const uid = () => Math.random().toString(36).slice(2, 9)

export function PatientAssistant({ onBook }: { onBook: (prefill: BookingPrefill) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ChatItem[]>([OPENING])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 180)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [items, typing, open])

  const push = (item: Omit<ChatItem, 'id'>) => setItems((prev) => [...prev, { ...item, id: uid() }])

  const send = async (text: string) => {
    const value = text.trim()
    if (!value || busy.current) return

    busy.current = true
    push({ role: 'user', text: value })
    setInput('')
    setTyping(true)

    try {
      const reply: PatientReply = await askPatientAssistant(value)
      push({ role: 'assistant', text: reply.text, chips: reply.chips, slots: reply.slots })
    } catch {
      push({
        role: 'assistant',
        text: 'Не получилось ответить — кажется, пропала связь. Позвоните нам, и мы всё подскажем: +7 495 120-14-14.',
      })
    } finally {
      setTyping(false)
      busy.current = false
    }
  }

  const pickSlot = (slot: PatientSlot) => {
    onBook({ service: slot.service, doctorId: slot.doctorId, start: slot.start })
    push({
      role: 'assistant',
      text: `Подставил ${slot.label} в форму записи — осталось указать имя и телефон.`,
    })
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="pa-launcher" onClick={() => setOpen(true)} aria-label="Открыть помощника клиники">
        <span className="pa-launcher-icon">
          <Icon name="sparkles" size={18} />
        </span>
        <span>
          Помощник клиники
          <small>подскажет и запишет</small>
        </span>
      </button>
    )
  }

  return (
    <section className="pa-panel" role="dialog" aria-label="Помощник клиники">
      <header className="pa-head">
        <span className="pa-avatar">
          <Icon name="sparkles" size={17} />
        </span>
        <div>
          <div className="pa-title">Помощник клиники</div>
          <div className="pa-sub">
            <span className="pa-dot" />
            На связи · отвечает мгновенно
          </div>
        </div>
        <button className="pa-close" onClick={() => setOpen(false)} aria-label="Закрыть">
          <Icon name="x" size={17} />
        </button>
      </header>

      <div className="pa-body" ref={bodyRef}>
        {items.map((item) => (
          <div key={item.id} className={`pa-row ${item.role}`}>
            <div className={`pa-msg ${item.role}`}>{item.text}</div>

            {item.slots && item.slots.length > 0 && (
              <div className="pa-slots">
                {item.slots.map((slot) => (
                  <button key={slot.start} className="pa-slot" onClick={() => pickSlot(slot)}>
                    <b>{slot.label}</b>
                    <span>{slot.doctorName.split(' ').slice(1).join(' ')}</span>
                  </button>
                ))}
              </div>
            )}

            {item.chips && item.chips.length > 0 && (
              <div className="pa-chips">
                {item.chips.map((chip) => (
                  <button key={chip} className="pa-chip" onClick={() => void send(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {typing && (
          <div className="pa-row assistant">
            <div className="pa-msg assistant pa-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <footer className="pa-foot">
        <input
          ref={inputRef}
          className="pa-input"
          placeholder="Спросите про цену, врача или время"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void send(input)
            }
          }}
        />
        <button className="pa-send" onClick={() => void send(input)} disabled={!input.trim() || typing} aria-label="Отправить">
          <Icon name="send" size={16} />
        </button>
      </footer>
    </section>
  )
}
