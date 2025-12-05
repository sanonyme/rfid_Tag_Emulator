@echo off
echo Cleaning build files...

if exist "out" (
    rmdir /s /q out
    echo Build files cleaned successfully!
) else (
    echo Nothing to clean.
)

