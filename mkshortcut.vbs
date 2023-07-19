set WshShell = WScript.CreateObject("WScript.Shell" )
set oShellLink = WshShell.CreateShortcut(Wscript.Arguments.Named("shortcut") & ".lnk")

oShellLink.TargetPath = WshShell.CurrentDirectory & "\" & Wscript.Arguments.Named("target")
oShellLink.WorkingDirectory = WshShell.CurrentDirectory
oShellLink.WindowStyle = 1
oShellLink.Save