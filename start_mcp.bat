@echo off
:: start_mcp.bat
:: Launch the ServerMind MCP backend server.
:: The backend also serves the Web UI at: http://127.0.0.1:17432/ui/
:: The MCP SSE endpoint is available at:   http://127.0.0.1:17433/sse
::
:: Requirements:
::   - Python 3.11+ on PATH
::   - Package installed: pip install -e .

title ServerMind MCP - Backend Server
echo ============================================================
echo  ServerMind MCP
echo ============================================================
echo  Starting backend...
echo  Web UI will be available at:  http://127.0.0.1:17432/ui/
echo  MCP SSE endpoint available at: http://127.0.0.1:17433/sse
echo  Press Ctrl+C to stop.
echo.

:: Open browser after a short delay (3 seconds for backend to start)
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:17432/ui/"

python -m mcp_server --transport sse %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] MCP server failed to start.
    echo         Make sure: pip install -e .
    pause
)
