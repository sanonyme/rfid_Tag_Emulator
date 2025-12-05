@echo off
echo ====================================
echo Building RFID Tag Emulator
echo ====================================

REM Create output directory
if not exist "out" mkdir out

REM Compile all Java files (target Java 8)
echo Compiling Java files for Java 8 compatibility...
rem First try modern flag --release 8 (JDK 9+). If it fails, fall back to -source/-target 1.8
javac --release 8 -d out -sourcepath . *.java 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo --release not supported, falling back to -source 1.8 -target 1.8
    javac -source 1.8 -target 1.8 -d out -sourcepath . *.java
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================
    echo Build successful!
    echo ====================================
    echo Compiled files are in the 'out' directory
    if exist logo.png copy /Y logo.png out >nul
    if exist logo.png echo Copied logo.png into out
    if exist "MENU ICONS VSBL.png@3x.png" copy /Y "MENU ICONS VSBL.png@3x.png" out >nul
    if exist "MENU ICONS VSBL.png@3x.png" echo Copied MENU ICONS VSBL.png@3x.png into out
    echo Run 'run.bat' to start the application
) else (
    echo.
    echo ====================================
    echo Build failed!
    echo ====================================
    exit /b 1
)

