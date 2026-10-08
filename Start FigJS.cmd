@echo off
setlocal
title FigJS
cd /d "%~dp0"

set "NODE="
where node >nul 2>nul && node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)" >nul 2>nul && set "NODE=node"
if not defined NODE if exist ".runtime\node\node.exe" set "NODE=%~dp0.runtime\node\node.exe"
if not defined NODE (
  echo.
  echo   Node.js 18 or newer was not found. A private copy is downloaded into
  echo   .runtime\node, once. Nothing is installed on the system.
  echo.
  set "PSModulePath="
  powershell -NoProfile -ExecutionPolicy Bypass -File "editor\server\get-node.ps1"
  if errorlevel 1 goto failed
  set "NODE=%~dp0.runtime\node\node.exe"
)

"%NODE%" editor\server\start.js %*
if errorlevel 1 pause
exit /b

:failed
echo.
echo   Node.js could not be downloaded. Check the internet connection, or
echo   install Node.js from https://nodejs.org and start again.
echo.
pause
exit /b 1
