' Lance le worker du pont Dev-Team en arriere-plan, sans fenetre.
'
' Installation : copier ce fichier dans
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
' Il demarrera a chaque ouverture de session Windows.
'
' Le dossier du projet est deduit de l'emplacement du script.
' S'il est place ailleurs, definir la variable d'environnement DEVTEAM_DIR.

Dim fso, shell, scriptDir, projectDir, cmd, envDir

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Priorite 1 : variable d'environnement explicite
envDir = shell.ExpandEnvironmentStrings("%DEVTEAM_DIR%")
If envDir <> "%DEVTEAM_DIR%" And fso.FolderExists(envDir) Then
    projectDir = envDir
Else
    ' Priorite 2 : dossier parent du dossier contenant ce script
    scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
    projectDir = fso.GetParentFolderName(scriptDir)
End If

If Not fso.FileExists(projectDir & "\scripts\bridge_worker.py") Then
    MsgBox "Worker introuvable. Definir DEVTEAM_DIR vers le dossier du projet.", 16, "Dev-Team"
    WScript.Quit 1
End If

cmd = "cmd /c cd /d """ & projectDir & """ && python scripts\bridge_worker.py >> .bridge.log 2>&1"
shell.Run cmd, 0, False
