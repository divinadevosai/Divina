; Divina Windows installer. Built by scripts/build-windows.mjs:
;   makensis -DVERSION=x.y.z -DSTAGE=<dir> -DNODE_VERSION=vN -DOUT=<file>
;            (-DNODE_DIR=<dir>                      Node.js inside the installer
;             | -DNODE_URL=<zip> -DNODE_SHA256=<hex>) or downloaded while installing
;            installer.nsi
; Installs for the current user only (no admin prompt) into
; %LOCALAPPDATA%\Programs\Divina. Settings and keys live in %APPDATA%\Divina
; and survive updates; the uninstaller asks before removing them.
Target amd64-unicode
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!define APP "Divina"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Divina"

Name "${APP}"
OutFile "${OUT}"

; sign the installer and the uninstaller (scripts/windows/sign.mjs; does nothing without a certificate)
!ifdef SIGN_NODE
  !finalize '"${SIGN_NODE}" "${SIGN_SCRIPT}" "%1"' = 0
  !uninstfinalize '"${SIGN_NODE}" "${SIGN_SCRIPT}" "%1"' = 0
!endif
InstallDir "$LOCALAPPDATA\Programs\Divina"
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Sweeney Creative"
VIAddVersionKey "LegalCopyright" "© 2026 Sweeney Creative"

!include MUI2.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include x64.nsh

!define MUI_ICON "divina.ico"
!define MUI_UNICON "divina.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install Divina"
!define MUI_WELCOMEPAGE_TEXT "Divina turns your screen into a room you control with your hands and your voice.$\r$\n$\r$\nIt installs just for you (no administrator password needed) and runs on this computer. After installing, enter the licence key from your receipt email.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Divina.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Divina now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGE}\LICENSE.txt"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; Stop a running Divina so its files can be replaced.
; Close Divina completely so its files can be replaced: the Divina.exe
; starter (it stays open while Divina runs, which is what locked the file),
; the launcher and the server. Only processes started from THIS install
; folder are touched; the folder is passed as an environment variable, so a
; name with quotes or spaces can't break the command.
!macro StopDivina
  ${If} ${FileExists} "$INSTDIR\Divina.exe"
    System::Call 'kernel32::SetEnvironmentVariable(t "DIVINA_DIR", t "$INSTDIR\")'
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Get-Process -Name Divina,node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$env:DIVINA_DIR, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force"`
    Pop $0
    ${If} ${FileExists} "$INSTDIR\node\node.exe"
      nsExec::Exec '"$INSTDIR\node\node.exe" "$INSTDIR\launcher.cjs" --stop'
      Pop $0
    ${EndIf}
    Sleep 1200
  ${EndIf}
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "Divina needs 64-bit Windows 10 or 11." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

!ifndef NODE_DIR
!define PS '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command'
!define NODE_FOLDER "node-${NODE_VERSION}-win-x64"

!macro NodeFailed MSG
  ${EnableX64FSRedirection}
  MessageBox MB_ICONSTOP|MB_OK "${MSG}" /SD IDOK
  Abort
!macroend

; Download Node.js from nodejs.org, check it against the checksum baked in
; at build time, and unpack node.exe. Skipped when this exact version is
; already installed from an earlier setup.
Function GetNode
  ${If} ${FileExists} "$INSTDIR\node\node.exe"
    ClearErrors
    FileOpen $0 "$INSTDIR\node\VERSION" r
    ${IfNot} ${Errors}
      FileRead $0 $1
      FileClose $0
      ${If} $1 == "${NODE_VERSION}"
        DetailPrint "Node.js ${NODE_VERSION} is already installed."
        Return
      ${EndIf}
    ${EndIf}
  ${EndIf}

  InitPluginsDir
  ${DisableX64FSRedirection}
  DetailPrint "Downloading Node.js ${NODE_VERSION} from nodejs.org…"
  nsExec::ExecToLog '"$SYSDIR\curl.exe" -fsSL --retry 3 --connect-timeout 20 -o "$PLUGINSDIR\node.zip" "${NODE_URL}"'
  Pop $0
  ${If} $0 != 0
    nsExec::ExecToLog `${PS} "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '${NODE_URL}' -OutFile '$PLUGINSDIR\node.zip'"`
    Pop $0
  ${EndIf}
  ${If} $0 != 0
    !insertmacro NodeFailed "Setup couldn't download Node.js, which Divina needs to run.$\r$\n$\r$\nCheck your internet connection and run Setup again."
  ${EndIf}

  DetailPrint "Checking the download…"
  nsExec::ExecToStack `${PS} "(Get-FileHash -Algorithm SHA256 -LiteralPath '$PLUGINSDIR\node.zip').Hash"`
  Pop $0
  Pop $1
  StrCpy $1 $1 64
  ${If} $1 != "${NODE_SHA256}"
    !insertmacro NodeFailed "The Node.js download didn't match its checksum, so Setup didn't use it.$\r$\n$\r$\nRun Setup again. If this keeps happening, your network may be changing downloads."
  ${EndIf}

  DetailPrint "Unpacking…"
  nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$PLUGINSDIR\node.zip" -C "$PLUGINSDIR" "${NODE_FOLDER}/node.exe" "${NODE_FOLDER}/LICENSE"'
  Pop $0
  ${IfNot} ${FileExists} "$PLUGINSDIR\${NODE_FOLDER}\node.exe"
    nsExec::ExecToLog `${PS} "Expand-Archive -LiteralPath '$PLUGINSDIR\node.zip' -DestinationPath '$PLUGINSDIR' -Force"`
    Pop $0
  ${EndIf}
  ${EnableX64FSRedirection}
  ${IfNot} ${FileExists} "$PLUGINSDIR\${NODE_FOLDER}\node.exe"
    !insertmacro NodeFailed "Setup couldn't unpack Node.js. Run Setup again."
  ${EndIf}

  RMDir /r "$INSTDIR\node"
  CreateDirectory "$INSTDIR\node"
  CopyFiles /SILENT "$PLUGINSDIR\${NODE_FOLDER}\node.exe" "$INSTDIR\node"
  CopyFiles /SILENT "$PLUGINSDIR\${NODE_FOLDER}\LICENSE" "$INSTDIR\node"
  FileOpen $0 "$INSTDIR\node\VERSION" w
  FileWrite $0 "${NODE_VERSION}"
  FileClose $0
  Delete "$PLUGINSDIR\node.zip"
FunctionEnd
!endif

Section "Divina" SecMain
  SectionIn RO
  SetShellVarContext current
  !insertmacro StopDivina
  ; a clean app folder on every update, so no stale files linger
  RMDir /r "$INSTDIR\app"

  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*"
!ifdef NODE_DIR
  RMDir /r "$INSTDIR\node"
  SetOutPath "$INSTDIR\node"
  File /r "${NODE_DIR}\*"
  SetOutPath "$INSTDIR"
!else
  Call GetNode
!endif

  CreateShortcut "$SMPROGRAMS\Divina.lnk" "$INSTDIR\Divina.exe" "" "$INSTDIR\divina.ico"
  CreateShortcut "$DESKTOP\Divina.lnk" "$INSTDIR\Divina.exe" "" "$INSTDIR\divina.ico"

  WriteUninstaller "$INSTDIR\Uninstall Divina.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Sweeney Creative"
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "https://divinaos.site"
  WriteRegStr HKCU "${UNINST_KEY}" "HelpLink" "mailto:dev@divinaos.site"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\divina.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall Divina.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall Divina.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  !insertmacro StopDivina
  Delete "$SMPROGRAMS\Divina.lnk"
  Delete "$DESKTOP\Divina.lnk"
  ; Only Divina's own files, never "everything in this folder": if the
  ; uninstaller were copied somewhere else and run, a recursive delete of
  ; its folder would wipe that folder.
  ${If} ${FileExists} "$INSTDIR\launcher.cjs"
    RMDir /r "$INSTDIR\app"
    RMDir /r "$INSTDIR\node"
  ${EndIf}
  Delete "$INSTDIR\Divina.exe"
  Delete "$INSTDIR\launcher.cjs"
  Delete "$INSTDIR\divina.ico"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
  Delete "$INSTDIR\THIRD_PARTY_LICENSES.txt"
  Delete "$INSTDIR\Uninstall Divina.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your Divina settings, including your saved API key?$\r$\n$\r$\nChoose No if you plan to install Divina again.$\r$\n$\r$\nTo move your licence to another computer, deactivate it first in Divina (Settings, Licence)." IDNO keep
    RMDir /r "$APPDATA\Divina"
    keep:
  ${EndIf}
SectionEnd
