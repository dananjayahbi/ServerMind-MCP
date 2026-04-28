@echo off
:: start_gui.bat
:: Launch the ServerMind MCP GUI (with console for debug output).
:: For a silent launch (no console), use StartGUI.vbs instead.
::
:: Requirements:
::   - Python 3.11+ on PATH
::   - Package installed: pip install -e .

title ServerMind MCP - GUI
echo Starting ServerMind MCP GUI...
python -m gui %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] GUI failed to start. Make sure Python 3.11+ is installed
    echo         and the package is installed: pip install -e .
    pause
)
