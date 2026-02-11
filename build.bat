@echo off
setlocal

echo ==========================================
echo  Build Start
echo ==========================================

if exist release (
  echo Cleaning existing release directory...
  rmdir /s /q release
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
call npx electron-builder --win --config electron-builder.json
IF ERRORLEVEL 1 GOTO fail

echo.
echo ==========================================
echo  SUCCESS: Installer created in .\release
echo ==========================================
GOTO end

:fail
echo Build process aborted.
exit /b 1

:end
exit /b 0