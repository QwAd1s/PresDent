import type { SeriesPoint } from '../../shared/types'
import { formatShortDate } from '../lib/format'

const LAYERS: { key: keyof Omit<SeriesPoint, 'date'>; color: string; label: string }[] = [
  { key: 'whatsapp', color: '#25d366', label: 'WhatsApp' },
  { key: 'instagram', color: '#dd2a7b', label: 'Instagram' },
  { key: 'site', color: '#64748b', label: 'Сайт' },
  { key: 'phone', color: '#e5a63c', label: 'Телефон' },
]

const W = 720
const H = 208
const PAD = { top: 12, right: 8, bottom: 26, left: 30 }

export function ChannelLegend() {
  return (
    <div className="chart-legend">
      {LAYERS.map((layer) => (
        <span className="legend-item" key={layer.key}>
          <span className="legend-dot" style={{ background: layer.color }} />
          {layer.label}
        </span>
      ))}
    </div>
  )
}

export function LeadsChart({ series }: { series: SeriesPoint[] }) {
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const totals = series.map((point) => LAYERS.reduce((sum, layer) => sum + point[layer.key], 0))
  const max = Math.max(...totals, 4)
  const step = plotW / Math.max(series.length, 1)
  const barWidth = Math.min(34, step * 0.5)

  const ticks = Array.from({ length: 4 }, (_, index) => Math.round((max / 3) * index)).filter(
    (value, index, array) => array.indexOf(value) === index,
  )

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Заявки по дням и каналам">
      {ticks.map((tick) => {
        const y = PAD.top + plotH - (tick / max) * plotH
        return (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="#e9eff1"
              strokeDasharray="3 4"
            />
            <text x={PAD.left - 8} y={y + 3.5} textAnchor="end">
              {tick}
            </text>
          </g>
        )
      })}

      {series.map((point, index) => {
        const x = PAD.left + step * index + (step - barWidth) / 2
        let cursor = PAD.top + plotH

        return (
          <g key={point.date}>
            {LAYERS.map((layer) => {
              const value = point[layer.key]
              if (!value) return null
              const height = Math.max((value / max) * plotH, 2)
              cursor -= height
              return (
                <rect
                  key={layer.key}
                  x={x}
                  y={cursor}
                  width={barWidth}
                  height={height}
                  fill={layer.color}
                  rx={index === series.length - 1 ? 3 : 0}
                  opacity={0.92}
                >
                  <title>{`${formatShortDate(point.date)} · ${layer.label}: ${value}`}</title>
                </rect>
              )
            })}
            <text x={x + barWidth / 2} y={H - 8} textAnchor="middle">
              {formatShortDate(`${point.date}T12:00:00`)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
