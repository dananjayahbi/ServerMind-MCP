' StartGUI.vbs
' Launches the ServerMind MCP GUI without showing a console window.
' Double-click this file or create a shortcut to it.
'
' Requirements:
'   - Python 3.11+ must be installed and on PATH (or adjust PythonExe below)
'   - servermind-mcp package must be installed: pip install -e .
'
' -----------------------------------------------------------------------

Option Explicit

Dim WshShell, PythonExe, ScriptDir, Command

Set WshShell = CreateObject("WScript.Shell")

' Resolve the directory this .vbs file lives in (project root)
ScriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Try "pythonw" first (hides console), fall back to "python"
PythonExe = "pythonw"

' Run: pythonw -m gui
' WindowStyle 0 = hidden window (no console flicker)
Command = PythonExe & " -m gui"

On Error Resume Next
WshShell.Run Command, 0, False
If Err.Number <> 0 Then
    ' pythonw not found, try python
    Err.Clear
    WshShell.Run "python -m gui", 0, False
End If
On Error GoTo 0

Set WshShell = Nothing
