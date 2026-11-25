import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Channel, ChannelEvent } from '../../shared/types'
import { getChannels, getEventsLog, testChannel, type ChannelsPayload } from '../lib/api'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { InstagramGlyph, Modal, SkeletonRows, WhatsAppGlyph } from '../components/ui'

const CHANNEL_GRADIENT: Record<string, string> = {
  whatsapp: 'linear-gradient(160deg, #2ee07a, #12a24f)',
  instagram: 'linear-gradient(155deg, #f58529, #dd2a7b 55%, #8134af)',
  site: 'linear-gradient(160deg, #64748b, #334155)',
  phone: 'linear-gradient(160deg, #f0b95a, #d9932a)',
}

const KIND_COLOR: Record<ChannelEvent['kind'], string> = {
  incoming: '#0E9E7B',
  outgoing: '#2F6FED',
  system: '#82969F',
  error: '#DD5157',
}

export default function Channels() {
  const navigate = useNavigate()
  const [data, setData] = useState<ChannelsPayload | null>(null)
  const [events, setEvents] = useState<ChannelEvent[]>([])
  const [testing, setTesting] = useState<Channel | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [guide, setGuide] = useState<Channel | null>(null)

  const load = async () => {
    const [channelsPayload, eventsPayload] = await Promise.all([getChannels(), getEventsLog()])
    setData(channelsPayload)
    setEvents(eventsPayload.items)
  }

  useEffect(() => {
    void load()
  }, [])

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  const runTest = async (channel: Channel) => {
    setTesting(channel)
    const result = await testChannel(channel)
    setTesting(null)
    if (result) {
      setToast(`Создана заявка от ${result.lead.name}: «${result.lead.messages[0]?.text.slice(0, 64)}…»`)
      void load()
    }
  }

  const base = data?.publicUrl || (typeof window !== 'undefined' ? window.location.origin : '')

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Каналы и интеграции</h1>
          <div className="page-sub">WhatsApp, Instagram и сайт — единый входящий поток заявок</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => void load()}>
            <Icon name="refresh" size={15} />
            Обновить
          </button>
        </div>
      </div>

      <div className="hint-box" style={{ marginBottom: 16 }}>
        <Icon name="bolt" size={16} />
        <div>
          Meta присылает события на публичный HTTPS-адрес. Для локальной разработки используйте туннель
          (<code>ngrok http 8787</code> или <code>cloudflared tunnel --url http://localhost:8787</code>) и укажите его
          в <code>PUBLIC_URL</code>. Адрес вебхука и verify-token ниже нужно вставить в настройках приложения Meta.
        </div>
      </div>

      {toast && (
        <div
          className="hint-box"
          style={{ marginBottom: 16, background: 'var(--brand-soft)', borderColor: '#cdeee2', color: '#0a5c45' }}
        >
          <Icon name="check" size={16} />
          <div style={{ flex: 1 }}>{toast}</div>
          <button className="btn-link" onClick={() => navigate('/leads')}>
            Открыть заявки
          </button>
        </div>
      )}

      {!data ? (
        <div className="card">
          <SkeletonRows rows={5} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {data.items.map((channel) => {
              const state = !channel.connected ? 'off' : channel.mode === 'live' ? 'live' : 'demo'
              const webhookUrl = channel.webhookPath === '—' ? '—' : `${base}${channel.webhookPath}`

              return (
                <article className="card channel-card" key={channel.id}>
                  <div className="channel-head">
                    <span className="channel-logo" style={{ background: CHANNEL_GRADIENT[channel.id] }}>
                      {channel.id === 'whatsapp' && <WhatsAppGlyph size={24} />}
                      {channel.id === 'instagram' && <InstagramGlyph size={23} />}
                      {channel.id === 'site' && <Icon name="globe" size={22} />}
                      {channel.id === 'phone' && <Icon name="phone" size={21} />}
                    </span>
                    <div>
                      <div style={{ fontWeight: 650 }}>{channel.title}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {channel.account}
                      </div>
                    </div>
                    <span className={`integration-state ${state}`}>
                      <span className={`dot ${state === 'live' ? 'live' : 'demo'}`} style={{ boxShadow: 'none' }} />
                      {state === 'live' ? 'Работает' : state === 'demo' ? 'Демо-режим' : 'Не подключено'}
                    </span>
                  </div>

                  {channel.webhookPath !== '—' && (
                    <>
                      <div>
                        <div className="section-label" style={{ marginBottom: 6 }}>
                          URL для вебхука (Callback URL)
                        </div>
                        <div className="code-line">
                          <span>{webhookUrl}</span>
                          <button className="copy" onClick={() => void copy(webhookUrl, channel.id)} aria-label="Скопировать">
                            <Icon name={copied === channel.id ? 'check' : 'copy'} size={14} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon
                            name={channel.verifyTokenConfigured ? 'check' : 'alert'}
                            size={14}
                            style={{ color: channel.verifyTokenConfigured ? 'var(--brand)' : 'var(--danger)' }}
                          />
                          Verify token
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon
                            name={channel.tokenConfigured ? 'check' : 'alert'}
                            size={14}
                            style={{ color: channel.tokenConfigured ? 'var(--brand)' : 'var(--danger)' }}
                          />
                          Access token
                        </span>
                        <span className="muted" style={{ marginLeft: 'auto' }}>
                          {channel.lastEventAt ? `событие ${relativeTime(channel.lastEventAt)}` : 'событий пока не было'}
                        </span>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      className="btn btn-soft btn-sm"
                      style={{ flex: 1 }}
                      disabled={testing === channel.id}
                      onClick={() => void runTest(channel.id)}
                    >
                      <Icon name="bolt" size={14} />
                      {testing === channel.id ? 'Проверяем…' : 'Тестовая заявка'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setGuide(channel.id)}>
                      <Icon name="settings" size={14} />
                      Настроить
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Журнал событий</div>
                <div className="card-sub">Входящие сообщения, ответы администраторов и системные события</div>
              </div>
              <span className="pill" style={{ marginLeft: 'auto' }}>
                <span className="dot live" style={{ boxShadow: 'none' }} />
                live
              </span>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              {events.length ? (
                events.slice(0, 10).map((event) => (
                  <div className="log-item" key={event.id}>
                    <span className="time">{relativeTime(event.at)}</span>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: KIND_COLOR[event.kind], marginTop: 6 }} />
                    <span style={{ flex: 1 }}>{event.text}</span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {event.channel}
                    </span>
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  Пока тихо — события появятся, как только пациенты начнут писать.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {guide && <SetupGuide channel={guide} onClose={() => setGuide(null)} />}
    </>
  )
}

const GUIDES: Record<Channel, { title: string; steps: string[]; note?: string }> = {
  whatsapp: {
    title: 'Подключение WhatsApp Cloud API',
    steps: [
      'Создайте приложение в Meta for Developers → тип «Business» и добавьте продукт WhatsApp.',
      'В WhatsApp Manager подключите номер телефона клиники и получите Phone number ID.',
      'Создайте System User с правом whatsapp_business_messaging и сгенерируйте постоянный токен.',
      'Заполните .env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN (любая строка).',
      'В разделе Configuration укажите Callback URL из карточки выше и тот же verify-token, подпишите поле messages.',
      'Перезапустите сервер: DRY_RUN=false, чтобы ответы реально уходили пациентам.',
    ],
    note: 'Свободным текстом можно отвечать только в течение 24 часов с последнего сообщения пациента. Вне окна нужны утверждённые шаблоны (message templates).',
  },
  instagram: {
    title: 'Подключение Instagram Messaging',
    steps: [
      'Переведите аккаунт клиники в профессиональный режим и свяжите его со страницей Facebook.',
      'В приложении Meta добавьте продукт Messenger и подключите страницу; включите «Instagram messaging» в настройках.',
      'Получите Page access token с правами instagram_basic, instagram_manage_messages, pages_messaging.',
      'Заполните .env: INSTAGRAM_PAGE_TOKEN, INSTAGRAM_ACCOUNT_ID (IG business account id), INSTAGRAM_VERIFY_TOKEN.',
      'В настройках вебхука Messenger укажите Callback URL и подпишитесь на поля messages, messaging_postbacks.',
      'Отправьте тестовое сообщение в Direct — заявка появится в разделе «Заявки».',
    ],
    note: 'Имя пользователя в вебхуке не приходит — подтягивайте @username отдельным запросом Graph API /{igsid}?fields=username.',
  },
  site: {
    title: 'Форма заявки на сайте',
    steps: [
      'Отправляйте POST-запрос на /api/webhooks/site с полями name, phone, service, message.',
      'Или вставьте готовую форму: имя, телефон, услуга и комментарий.',
      'Ответ 201 означает, что заявка создана и уже появилась у администратора.',
    ],
    note: 'Добавьте hCaptcha или rate-limit, чтобы защитить форму от спама.',
  },
  phone: {
    title: 'Входящие звонки',
    steps: [
      'Подключите телефонию через провайдера с вебхуками (Mango, UIS, Asterisk + ARI).',
      'Настройте отправку POST на /api/webhooks/phone при пропущенном звонке.',
      'Заявка создастся автоматически с типом «Телефон» — администратор перезвонит.',
    ],
  },
}

function SetupGuide({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const guide = GUIDES[channel]
  return (
    <Modal title={guide.title} subtitle="Пошаговая инструкция" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Понятно</button>}>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {guide.note && (
        <div className="hint-box warn">
          <Icon name="alert" size={15} />
          <div>{guide.note}</div>
        </div>
      )}
    </Modal>
  )
}
