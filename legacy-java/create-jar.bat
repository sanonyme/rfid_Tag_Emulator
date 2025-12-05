@echo off
echo ====================================
echo Creating JAR file for RFID Tag Emulator GUI
echo ====================================

REM First, ensure the project is compiled
if not exist "out" (
    echo Compiling project first...
    call build.bat
    if %ERRORLEVEL% NEQ 0 (
        echo Build failed. Cannot create JAR.
        exit /b 1
    )
)

REM Create manifest file
echo Creating manifest...
echo Main-Class: EmulatorUI> manifest.txt
echo.>> manifest.txt

REM Create the JAR file
echo Creating JAR file...
cd out
jar cvfm ..\RFIDEmulator.jar ..\manifest.txt .
cd ..

REM Clean up manifest file
del manifest.txt

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================
    echo JAR file created successfully!
    echo ====================================
    echo File: RFIDEmulator.jar
    echo.
    echo To run the JAR file, use:
    echo java -jar RFIDEmulator.jar
    echo.
) else (
    echo.
    echo ====================================
    echo JAR creation failed!
    echo ====================================
    exit /b 1
)

