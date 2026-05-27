@echo off
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  set "PY=.venv\Scripts\python.exe"
) else (
  set "PY=python"
)
start "LIQTRAP WEB" http://127.0.0.1:8010
%PY% -m uvicorn web.app:app --host 127.0.0.1 --port 8010 --reload
