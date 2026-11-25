# PresiDent — платформа стоматологии

Админ-панель клиники, куда попадают заявки из **WhatsApp**, **Instagram**, с сайта и телефона.
Пациентские сценарии (личный кабинет, запись, отзывы) — следующие этапы, см. `STRUCTURE.md`.

**Стек:** React 19 + TypeScript + Vite · Node.js + Express · SSE для realtime · данные в JSON-файле (до подключения PostgreSQL).

---

## 1. Быстрый старт в VS Code

### 1.1 Проверьте Node.js

В терминале VS Code (`Ctrl + ~`):

```bash
node -v
npm -v
```

Если команда не найдена — установите **Node.js 22 LTS** с [nodejs.org](https://nodejs.org), затем **закройте и снова откройте VS Code** (чтобы подхватился PATH).

### 1.2 Установите зависимости

Терминал должен быть открыт в папке проекта (там, где лежит `package.json`):

```bash
cd C:\Users\fox\Documents\deepseek-harness\default-workspace\president
npm install
```

### 1.3 Запустите проект

```bash
npm run dev
```

Откройте в браузере: **http://localhost:5173**

Запустятся два процесса:

| Процесс | Адрес | Что делает |
|---|---|---|
| Vite (фронтенд) | http://localhost:5173 | админка с горячей перезагрузкой |
| API (Express) | http://localhost:8787/api | заявки, пациенты, вебхуки |

Файл `.env` не обязателен: без него сервер работает в демо-режиме (`DRY_RUN=true`) — сообщения не уходят в Meta, но вся логика приёма заявок работает.

### 1.4 Два способа запуска без терминала

- **Двойной клик по `start.cmd`** в папке проекта — сам проверит Node, при необходимости поставит зависимости, поднимет API и админку и покажет адрес.
- **F5 в VS Code** — в проекте есть `.vscode/launch.json` с конфигурацией *«PresiDent: API + админка»*. Выберите её в панели Run and Debug и нажмите ▶.

> Кнопка ▶ «Run» без выбранной конфигурации запускает `node` на текущем файле и падает с ошибкой `Cannot find module ...\run` — это не ошибка проекта, а неверный способ запуска.


---

## 2. Что посмотреть в первую очередь

1. **Главная** — KPI, график потока обращений, последние заявки.
2. **Заявки** — таблица обращений, фильтры по каналам и статусам; клик по строке открывает карточку с историей диалога и полем ответа.
3. **Каналы и интеграции** — статус WhatsApp/Instagram, адреса вебхуков, кнопка **«Тестовая заявка»**: она прогоняет сообщение через тот же конвейер, что и настоящий вебхук Meta, и заявка тут же появляется в разделе «Заявки».
4. **Расписание** — недельная сетка приёмов по врачам.
5. **Отзывы**, **База пациентов**, **Врачи**, **Настройки**.

> Если API не запустился, интерфейс автоматически переключается в **демо-режим** (данные в памяти браузера, бейдж в шапке) — страницы остаются работоспособными.

---

## 3. Скрипты

```bash
npm run dev        # фронтенд + API одновременно
npm run dev:web    # только Vite
npm run dev:api    # только API (tsx watch)
npm run build      # production-сборка фронтенда в dist/
npm start          # API + отдача собранного dist (http://localhost:8787)
npm run typecheck  # проверка типов
```

Проверка production-сборки:

```bash
npm run build
npm start
# открыть http://localhost:8787
```

---

## 4. Подключение WhatsApp и Instagram

### 4.1 Что нужно от Meta

| Что | Где взять |
|---|---|
| App ID / App Secret | Meta for Developers → ваше приложение |
| WhatsApp Phone number ID | WhatsApp Manager → номер клиники |
| WhatsApp permanent token | System User с правом `whatsapp_business_messaging` |
| Instagram Page token | страница Facebook, связанная с IG-аккаунтом, права `instagram_basic`, `instagram_manage_messages`, `pages_messaging` |
| Instagram Account ID | ID профессионального аккаунта Instagram |

### 4.2 Публичный HTTPS-адрес для вебхуков

Meta не может постучаться на `localhost`. Для разработки поднимаем туннель:

```bash
npx ngrok http 8787
# или
cloudflared tunnel --url http://localhost:8787
```

Полученный `https://…` адрес записываем в `.env` → `PUBLIC_URL`.

### 4.3 Настройка `.env`

Скопируйте `.env.example` в `.env` и заполните:

```env
PORT=8787
PUBLIC_URL=https://your-tunnel.ngrok-free.app

WHATSAPP_VERIFY_TOKEN=president-wa-verify
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890

INSTAGRAM_VERIFY_TOKEN=president-ig-verify
INSTAGRAM_PAGE_TOKEN=EAAG...
INSTAGRAM_ACCOUNT_ID=17841400000000000

META_APP_SECRET=abc123...
DRY_RUN=false        # true — не отправлять сообщения, только логировать
```

### 4.4 Вебхук в Meta for Developers

- **Callback URL (WhatsApp):** `https://<туннель>/api/webhooks/whatsapp`
- **Verify token:** значение `WHATSAPP_VERIFY_TOKEN`
- Подписаться на поле `messages`.
- **Instagram:** Callback URL `https://<туннель>/api/webhooks/instagram`, поле `messages` (+ `messaging_postbacks`).

Meta сразу отправит `GET` с `hub.challenge` — сервер вернёт его, подписка подтвердится. Дальше каждое входящее сообщение превращается в заявку и приходит в админку без перезагрузки страницы (SSE).

### 4.5 Проверка руками

```bash
# 1) проверка подписки
curl "http://localhost:8787/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=president-wa-verify&hub.challenge=ok"

# 2) имитация входящего сообщения от Meta
curl -X POST http://localhost:8787/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"changes\":[{\"value\":{\"contacts\":[{\"profile\":{\"name\":\"Иван\"},\"wa_id\":\"79001234567\"}],\"messages\":[{\"from\":\"79001234567\",\"id\":\"wamid.X\",\"timestamp\":\"1764000000\",\"type\":\"text\",\"text\":{\"body\":\"Сколько стоит имплантация?\"}}]}}]}]}"
```

Ответ `200`, а заявка появляется в админке (в демо-режиме — сразу, в live — после подписки на вебхук).

---

## 5. Деплой

### Вариант A. Один VPS (проще всего, всё на одном домене)

```bash
# на сервере (Ubuntu)
git clone <repo> /var/www/president && cd /var/www/president
npm install
npm run build
cp .env.example .env   # заполнить токены, PUBLIC_URL=https://crm.clinic.ru
```

Процесс-менеджер:

```bash
npm i -g pm2
pm2 start "npm start" --name president
pm2 save && pm2 startup
```

Nginx как reverse proxy с HTTPS (обязательно — Meta требует валидный сертификат):

```nginx
server {
    listen 443 ssl;
    server_name crm.clinic.ru;

    ssl_certificate     /etc/letsencrypt/live/crm.clinic.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.clinic.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;   # важно для SSE (/api/events)
    }
}
```

`certbot --nginx -d crm.clinic.ru` — сертификат.

### Вариант B. Render / Railway

- Один Web Service из репозитория: `Build: npm install && npm run build`, `Start: npm start`.
- Переменные окружения — из `.env.example`.
- Публичный адрес сервиса сразу годится как `PUBLIC_URL` для вебхуков.

### Вариант C. Vercel (фронтенд) + отдельный API

- фронтенд: Vercel, переменная `VITE_API_URL=https://api.clinic.ru`;
- API: Render/Railway/VPS; CORS уже разрешён в `server/index.ts`.

> Для реальных пациентов обязательны: авторизация сотрудников, PostgreSQL вместо JSON-файла, резервные копии и 152-ФЗ (хранение медданных в РФ).

---

## 6. Структура

```
president/
├── shared/             # типы и демо-данные, общие для фронта и бэка
│   ├── types.ts
│   └── fixtures.ts
├── server/             # Express API + приёмники Meta-вебхуков
│   ├── index.ts        # приложение, статика, запуск
│   ├── routes.ts       # REST + /api/webhooks/*
│   ├── ingest.ts       # единая точка входа для всех каналов
│   ├── channels.ts     # отправка ответов в WhatsApp / Instagram
│   ├── webhooks.ts     # разбор payload Meta
│   ├── store.ts        # JSON-хранилище
│   ├── realtime.ts     # SSE
│   └── config.ts       # .env
└── src/                # React-админка
    ├── pages/          # Главная, Заявки, Пациенты, Врачи, Расписание, Отзывы, Каналы, Настройки
    ├── components/     # Layout, Sidebar, Topbar, LeadDrawer, график, UI-кит
    ├── lib/            # api-клиент, демо-хранилище, форматтеры
    └── styles.css      # дизайн-система
```

Подробное описание архитектуры, модели данных и плана развития — в [STRUCTURE.md](./STRUCTURE.md).

---

## 7. Частые проблемы

| Симптом | Причина и решение |
|---|---|
| `npm: команда не найдена` | не установлен Node.js или VS Code не перезапущен после установки |
| `Cannot find module ...\president\run` | запустили `node run` или нажали ▶ без конфигурации — используйте `npm run dev`, `start.cmd` или F5 с конфигурацией из `.vscode/launch.json` |
| Порт 5173 занят | Vite выберет 5174 — смотрите вывод в терминале |
| Порт 8787 занят | `PORT=8788 npm run dev:api` (и прокси в `vite.config.ts`) |
| Бейдж «Демо-режим» | API не запущен: `npm run dev:api`; данные тогда живут только в браузере |
| Meta пишет «Callback verification failed» | `PUBLIC_URL` недоступен извне или verify-token не совпал с `.env` |
| Вебхук отвечает 401 | заполнен `META_APP_SECRET`, но подпись не совпала — проверьте, что тело запроса не меняется прокси |
