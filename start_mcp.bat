@echo off
:: start_mcp.bat
:: Launch the ServerMind MCP backend server (stdio mode).
:: Used for testing the MCP server outside of Claude Code.
::
:: For integration with Claude Code or Claude Desktop, configure via
:: the MCP settings JSON instead of running this batch file directly.
::
:: Requirements:
::   - Python 3.11+ on PATH
::   - Package installed: pip install -e .

title ServerMind MCP - Backend Server
echo Starting ServerMind MCP backend (stdio mode)...
echo Press Ctrl+C to stop.
echo.
python -m mcp_server %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] MCP server failed to start.
    echo         Make sure: pip install -e .
    pause
)
