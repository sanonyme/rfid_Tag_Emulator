@echo off
echo Cleaning up failed build directories...
echo.

rd /s /q build-output 2>nul
rd /s /q dist-app 2>nul
rd /s /q release 2>nul

echo.
echo ✓ Cleanup complete!
echo.
echo Your modern-ui folder is now clean and ready.
echo.
echo To run the app: start-clean.bat
echo To build: npm run electron:build
echo.
pause

















