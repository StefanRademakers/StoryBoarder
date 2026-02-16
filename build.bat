@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Build Start
echo ==========================================

if not exist assets (
  mkdir assets
)
if not exist assets\icon.ico (
  if exist icon.ico (
    echo Copying root icon.ico to assets\icon.ico...
    copy /y icon.ico assets\icon.ico >nul
  )
)

if exist release (
  echo Cleaning existing release directory...
  rmdir /s /q release
)

echo.
echo === Step 0: Ensure Python .venv (self-contained runtime) ===
if not exist .venv\Scripts\python.exe (
  echo Creating .venv...
  where py >nul 2>nul
  if %ERRORLEVEL%==0 (
    py -3 -m venv .venv
  ) else (
    python -m venv .venv
  )
  IF ERRORLEVEL 1 (
    echo [FAIL] Could not create .venv. Install Python 3 first.
    GOTO fail
  )
)

if exist python\requirements.txt (
  echo Installing Python requirements into .venv...
  .venv\Scripts\python.exe -m pip install --upgrade pip
  IF ERRORLEVEL 1 GOTO fail
  .venv\Scripts\python.exe -m pip install -r python\requirements.txt
  IF ERRORLEVEL 1 GOTO fail
)

echo.
echo === Step 0.5: Ensure Node dependencies ===
if not exist node_modules (
  call npm install
  IF ERRORLEVEL 1 GOTO fail
)

echo.
echo === Step 1: Build React (renderer) ===
call npm run build:react
IF ERRORLEVEL 1 GOTO fail
IF NOT EXIST dist\index.html (
  echo [FAIL] Frontend bundle NOT found: dist\index.html
  GOTO fail
)

echo.
echo === Step 2: Build Electron (main & preload) ===
call npm run build:electron
IF ERRORLEVEL 1 GOTO fail
IF NOT EXIST dist-electron\electron\main.js (
  echo [FAIL] Compiled main process entry NOT found: dist-electron\electron\main.js
  GOTO fail
)

echo.
echo === Step 3: Package with electron-builder ===
call npx electron-builder --win --config electron-builder.json --publish never
IF ERRORLEVEL 1 GOTO fail

if not exist release (
  echo [FAIL] release directory was not created.
  GOTO fail
)

dir /b release\*.exe >nul 2>nul
IF ERRORLEVEL 1 (
  echo [FAIL] No installer .exe found in release.
  GOTO fail
)

echo.
echo ==========================================
echo  SUCCESS: Installable release created in .\release
echo ==========================================
GOTO end

:fail
echo Build process aborted.
exit /b 1

:end
exit /b 0
