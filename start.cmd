@echo off
chcp 65001 >nul
title PresiDent — админ-панель
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ОШИБКА] Node.js не найден в PATH.
  echo  Установите Node.js 22 LTS с https://nodejs.org
  echo  и запустите этот файл заново ^(VS Code тоже нужно перезапустить^).
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite" (
  echo.
  echo  Устанавливаю зависимости, это займёт около минуты...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [ОШИБКА] Не удалось установить зависимости.
    echo  Проверьте подключение к интернету и наличие npm ^(node -v / npm -v^).
    pause
    exit /b 1
  )
)

echo.
echo  ============================================================
echo   PresiDent — платформа стоматологии
echo.
echo   Админка:  http://localhost:5173
echo   API:      http://localhost:8787/api
echo.
echo   Остановить: Ctrl + C  ^(или закройте это окно^)
echo  ============================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo  npm не найден — запускаю напрямую через node...
  echo.
  start "PresiDent API" cmd /k node node_modules\tsx\dist\cli.mjs server\index.ts
  node node_modules\vite\bin\vite.js
) else (
  call npm run dev
)

echo.
echo  Сервер остановлен.
pause
