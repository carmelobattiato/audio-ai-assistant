@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Audio AI Assistant — Installazione

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║      Audio AI Assistant — Installazione      ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Controlla se .env esiste
set "ENV_FILE=%~dp0.env"
if not exist "%ENV_FILE%" (
    echo  [ATTENZIONE] Per usare l'app e' necessaria una chiave API Gemini.
    echo.
    echo  Hai gia' la chiave? Puoi averla ricevuta dal tuo responsabile o IT.
    echo.
    set /p "HAS_KEY=Hai gia' la chiave API? [S/N]: "
    echo.
    if /i "!HAS_KEY!"=="N" (
        echo  Come ottenere una chiave gratuita:
        echo    1. Vai su: https://aistudio.google.com/apikey
        echo    2. Accedi con un account Google
        echo    3. Clicca "Create API Key" e copia la chiave
        echo.
        set /p "OPEN_BROWSER=Aprire il sito nel browser? [S/N]: "
        if /i "!OPEN_BROWSER!"=="S" (
            start https://aistudio.google.com/apikey
        )
        echo.
        echo  Quando hai la chiave, premi un tasto per continuare...
        pause >nul
    )
    echo GEMINI_API_KEY=incolla_qui_la_tua_chiave_api> "%ENV_FILE%"
    echo.
    echo  Si apre il Blocco Note.
    echo  Sostituisci "incolla_qui_la_tua_chiave_api" con la tua chiave, poi salva ^(Ctrl+S^) e chiudi.
    echo.
    notepad "%ENV_FILE%"
    echo.
    echo  Premi un tasto per continuare con l'installazione...
    pause >nul
)

echo.
echo  Avvio installazione...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0setup_and_run.ps1" install

echo.
echo  Premi un tasto per chiudere...
pause >nul
