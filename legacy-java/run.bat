@echo off
echo ====================================
echo Running RFID Tag Emulator
echo ====================================

if not exist "out" (
    echo Error: 'out' directory not found.
    echo Please run 'build.bat' first to compile the application.
    pause
    exit /b 1
)

java -cp out EmulatorUI

