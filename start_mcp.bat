@echo off
:: start_mcp.bat
:: Launch the ServerMind MCP backend server.
:: The MCP SSE endpoint is available at: http://127.0.0.1:17433/sse
:: The Next.js UI is available at:       http://localhost:17435
::
:: Requirements:
::   - Python 3.11+ on PATH
::   - Package installed: pip install -e .

title ServerMind MCP - Backend Server
echo ============================================================
echo  ServerMind MCP
echo ============================================================
echo  Starting backend...
echo  MCP SSE endpoint: http://127.0.0.1:17433/sse
echo  Next.js UI:       http://localhost:17435
echo  Press Ctrl+C to stop.
echo.

python -m mcp_server --transport sse %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] MCP server failed to start.
    echo         Make sure: pip install -e .
    pause
)
