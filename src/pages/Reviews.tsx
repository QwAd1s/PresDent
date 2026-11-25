import { useEffect, useMemo, useState } from 'react'
import { getReviews, replyToReview, type ReviewsPayload } from '../lib/api'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, ChannelIcon, ChannelTag, EmptyState, SkeletonRows, Stars } from '../components/ui'

export default function Reviews() {
  const [payload, setPayload] = useState<ReviewsPayload | null>(null)
  const [filter, setFilter] = useState<'all' | 'unanswered'>('all')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => getReviews().then(setPayload)

  useEffect(() => {
    void load()
  }, [])

  const items = useMemo(() => {
    if (!payload) return []
    return filter === 'unanswered' ? payload.items.filter((review) => !review.answered) : payload.items
  }, [payload, filter])

  const submitReply = async (id: string) => {
    const value = replyText.trim()
    if (!value || busy) return
    setBusy(true)
    await replyToReview(id, value)
    setReplyText('')
    setReplyTo(null)
    setBusy(false)
    await load()
  }

  const totalDist = payload?.distribution.reduce((sum, item) => sum + item.count, 0) || 1

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Отзывы</h1>
          <div className="page-sub">
            Собираем из WhatsApp, Instagram и с сайта · {payload?.unanswered ?? 0} без ответа
          </div>
        </div>
        <div className="page-actions">
          <div className="tabs">
            <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              Все
              <span className="count">{payload?.items.length ?? 0}</span>
            </button>
            <button className={`tab ${filter === 'unanswered' ? 'active' : ''}`} onClick={() => setFilter('unanswered')}>
              Без ответа
              <span className="count">{payload?.unanswered ?? 0}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
        <div className="stack">
          {!payload ? (
            <div className="card">
              <SkeletonRows rows={4} />
            </div>
          ) : items.length ? (
            items.map((review) => (
              <article className="card review" key={review.id}>
                <div className="review-head">
                  <Avatar name={review.author} size={36} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{review.author}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <Stars value={review.rating} />
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {relativeTime(review.at)}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChannelTag channel={review.channel} />
                    {review.answered ? (
                      <span className="badge status-booked">
                        <Icon name="check" size={12} />
                        Отвечен
                      </span>
                    ) : (
                      <span className="badge status-new">Ждёт ответа</span>
                    )}
                  </div>
                </div>

                <div className="review-text">{review.text}</div>

                {review.reply && (
                  <div className="review-reply">
                    <b style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Ответ клиники</b>
                    <div style={{ marginTop: 4 }}>{review.reply}</div>
                  </div>
                )}

                {replyTo === review.id ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea
                      className="input"
                      rows={3}
                      autoFocus
                      placeholder="Спасибо за отзыв! Нам важно ваше мнение…"
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" disabled={!replyText.trim() || busy} onClick={() => void submitReply(review.id)}>
                        <Icon name="send" size={14} />
                        Отправить ответ
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setReplyTo(null)
                          setReplyText('')
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      className="btn-link"
                      onClick={() => {
                        setReplyTo(review.id)
                        setReplyText(review.reply ?? '')
                      }}
                    >
                      <Icon name="message" size={14} />
                      {review.answered ? 'Изменить ответ' : 'Ответить публично'}
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="card">
              <EmptyState
                title="Здесь пусто"
                text="Все отзывы отвечены — так держать. Новые появятся автоматически."
                icon="star"
              />
            </div>
          )}
        </div>

        <div className="stack" style={{ position: 'sticky', top: 84 }}>
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Средняя оценка</div>
                <div className="card-sub">За всё время</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {payload?.average.toFixed(1) ?? '—'}
                </span>
                <div style={{ paddingBottom: 4 }}>
                  <Stars value={payload?.average ?? 0} size={15} />
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {payload?.items.length ?? 0} отзывов
                  </div>
                </div>
              </div>

              <div className="distribution" style={{ marginTop: 16 }}>
                {payload?.distribution.map((row) => (
                  <div className="dist-row" key={row.rating}>
                    <span>{row.rating} ★</span>
                    <span className="dist-track">
                      <span className="dist-fill" style={{ width: `${(row.count / totalDist) * 100}%` }} />
                    </span>
                    <span className="muted">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Как это работает</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 8, display: 'grid', gap: 10, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <div style={{ display: 'flex', gap: 9 }}>
                <ChannelIcon channel="whatsapp" size={18} />
                <span>После визита пациенту уходит сообщение в WhatsApp с просьбой оценить приём.</span>
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <ChannelIcon channel="instagram" size={18} />
                <span>Оценки из Instagram подтягиваются автоматически и попадают в эту ленту.</span>
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <Icon name="sparkles" size={16} />
                <span>Ответ публикуется от имени клиники и повышает доверие новых пациентов.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
