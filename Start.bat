@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup_and_run.ps1" open
