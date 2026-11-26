/**
 * Справочник услуг клиники: цена, длительность и специализация врача.
 * Один источник правды для админки, ИИ-админа и (в будущем) кабинета пациента.
 */

export interface Service {
  id: string
  title: string
  category: string
  price: number
  durationMin: number
  /** Ключевое слово специальности врача, который выполняет услугу */
  specialty: string
  description?: string
}

export const SERVICES: Service[] = [
  {
    id: 'consult',
    title: 'Консультация',
    category: 'Диагностика',
    price: 1_500,
    durationMin: 30,
    specialty: 'терапевт',
    description: 'Осмотр, план лечения и смета',
  },
  {
    id: 'ct',
    title: 'Компьютерная томография',
    category: 'Диагностика',
    price: 3_500,
    durationMin: 20,
    specialty: 'терапевт',
    description: '3D-снимок для имплантации и сложных случаев',
  },
  {
    id: 'hygiene',
    title: 'Гигиена и чистка',
    category: 'Гигиена',
    price: 6_500,
    durationMin: 60,
    specialty: 'гигиен',
    description: 'Ультразвук + Air Flow, полировка и фторирование',
  },
  {
    id: 'caries',
    title: 'Лечение кариеса',
    category: 'Терапия',
    price: 7_500,
    durationMin: 60,
    specialty: 'терапевт',
    description: 'Пломба из светового композита',
  },
  {
    id: 'canals',
    title: 'Лечение каналов',
    category: 'Терапия',
    price: 14_000,
    durationMin: 90,
    specialty: 'терапевт',
    description: 'Эндодонтия под микроскопом, 1 канал',
  },
  {
    id: 'implant',
    title: 'Имплантация',
    category: 'Хирургия',
    price: 55_000,
    durationMin: 120,
    specialty: 'имплант',
    description: 'Установка импланта под ключ, включая слепки',
  },
  {
    id: 'extraction',
    title: 'Удаление зуба',
    category: 'Хирургия',
    price: 6_000,
    durationMin: 60,
    specialty: 'имплант',
    description: 'Простое и сложное удаление, включая зубы мудрости',
  },
  {
    id: 'prosthetics',
    title: 'Протезирование',
    category: 'Ортопедия',
    price: 32_000,
    durationMin: 90,
    specialty: 'ортопед',
    description: 'Коронка из диоксида циркония',
  },
  {
    id: 'ortho',
    title: 'Ортодонтия',
    category: 'Ортодонтия',
    price: 180_000,
    durationMin: 90,
    specialty: 'ортодонт',
    description: 'Брекеты или элайнеры, план на 12–18 месяцев',
  },
  {
    id: 'aesthetic',
    title: 'Эстетика',
    category: 'Эстетика',
    price: 24_900,
    durationMin: 90,
    specialty: 'терапевт',
    description: 'Отбеливание ZOOM, виниры',
  },
  {
    id: 'kids',
    title: 'Детская стоматология',
    category: 'Детям',
    price: 3_500,
    durationMin: 45,
    specialty: 'детск',
    description: 'Адаптационный приём, лечение в игровой форме',
  },
]

export const SERVICE_TITLES = SERVICES.map((service) => service.title)

export const CATEGORIES = Array.from(new Set(SERVICES.map((service) => service.category)))

export const findService = (title?: string | null): Service | undefined =>
  title ? SERVICES.find((service) => service.title === title) : undefined

export const serviceDuration = (title?: string | null): number => findService(title)?.durationMin ?? 60

export const servicePrice = (title?: string | null): number => findService(title)?.price ?? 0

export const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`

/** Длительность по услуге одним словарём — удобно для API и расчёта слотов. */
export const SERVICE_DURATION: Record<string, number> = Object.fromEntries(
  SERVICES.map((service) => [service.title, service.durationMin]),
)
