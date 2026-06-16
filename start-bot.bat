@echo off
cd /d "%~dp0"

echo.
echo === Discord Sheets Bot ===
echo Stop ALL other copies of this bot first (Railway deploy, other terminals).
echo.

echo Stopping local node processes running src\bot.js ...
powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'src[\\\\/]bot\\.js' -or ($_.CommandLine -match 'discord-sheets-bot' -and $_.CommandLine -match 'bot\\.js') }; if (-not $procs) { Write-Host 'No local bot.js process found.' } else { $procs | ForEach-Object { Write-Host ('Stopping PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"

timeout /t 2 /nobreak >nul
echo.
echo Starting bot. After login you MUST see BOTH lines:
echo   Bot build: investigation-points-v2 (not legacy Authorize point).
echo   Running locally — if Railway also uses this bot token...
echo.
echo New /investigation logs must show "Award investigation points" + "All points awarded".
echo NOT "Authorize point".
echo.
"C:\Program Files\nodejs\npm.cmd" start
