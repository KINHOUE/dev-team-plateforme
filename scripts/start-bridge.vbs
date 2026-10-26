Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\PC\LOVEBLE && python scripts\bridge_worker.py >> .bridge.log 2>&1", 0, False
