; Divina.exe — the program people double-click.
; Runs node\node.exe launcher.cjs with no console window and, if Divina
; can't start, shows why in a message box. Built by scripts/build-windows.mjs.
Target amd64-unicode
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
Name "Divina"
OutFile "${OUT}"
Icon "divina.ico"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID lzma
!include LogicLib.nsh

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Divina"
VIAddVersionKey "FileDescription" "Divina"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Sweeney Creative"
VIAddVersionKey "LegalCopyright" "© 2026 Sweeney Creative"

Section
  ${IfNot} ${FileExists} "$EXEDIR\node\node.exe"
    MessageBox MB_ICONSTOP|MB_OK "Divina's files are missing. Please reinstall Divina."
    Quit
  ${EndIf}
  nsExec::ExecToStack '"$EXEDIR\node\node.exe" "$EXEDIR\launcher.cjs"'
  Pop $0
  Pop $1
  ${If} $0 == "error"
    MessageBox MB_ICONSTOP|MB_OK "Divina couldn't start. Please reinstall Divina."
  ${ElseIf} $0 != 0
    ${If} $1 == ""
      StrCpy $1 "Divina stopped unexpectedly. The log is in %APPDATA%\Divina\divina.log."
    ${EndIf}
    MessageBox MB_ICONEXCLAMATION|MB_OK "$1"
  ${EndIf}
SectionEnd
