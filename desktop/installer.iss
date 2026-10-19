; Instalador de VideoTotal (PC) con Inno Setup 6.
;
; Por qué Inno y no NSIS: el makensis 3.0.4.1 que trae electron-builder falla en
; este equipo con «Internal compiler error #12345: error creating mmap the size
; of 123597562» al empaquetar el payload de ~106 MB, y deja un setup.exe de
; 415 KB que solo contiene el desinstalador. Inno 6 compila el mismo payload sin
; problema. Compilar con:
;
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" desktop\installer.iss
;
; El resultado se genera en desktop\dist. Ojo: este instalador NO lo entiende
; electron-updater (que necesita artefactos NSIS); cuando se configure el canal
; de actualizaciones hay que decidir entre volver a NSIS o usar el updater propio.

#define MyAppName "VideoTotal"
#define MyAppVersion "0.3.12"
#define MyAppPublisher "Fabricio Delgado"
#define MyAppURL "https://github.com/fabriere/VideoTotal"
#define MyAppExeName "videototal.exe"

[Setup]
; AppId fijo: cambiarlo hace que Windows trate la app como otra distinta.
AppId={{7B4C6D2E-3F1A-4C8B-9E52-1D6A0F7C4B31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
; {autopf} con PrivilegesRequired=admin es %ProgramFiles%, y los accesos directos
; van a los del sistema. La instalación por usuario (PrivilegesRequired=lowest)
; falla en este equipo: al crear el .lnk del Escritorio y la clave HKCU de
; desinstalación Windows responde "Access is denied" (0x80070005 / RegCreateKeyEx
; código 5), incluso cuando el usuario es administrador.
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=VideoTotal-{#MyAppVersion}-setup
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
; Los datos del usuario viven en %APPDATA%\VideoTotal, no en {app}: desinstalar
; no borra la sesión, la licencia ni las listas.
MinVersion=10.0

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce

[Files]
; El build completo de electron-builder (out/ + Electron + app.asar).
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifexist "dist\win-unpacked\resources\app-update.yml"
Source: "dist\win-unpacked\resources\app-update.yml"; DestDir: "{app}\resources"; Flags: ignoreversion
#endif

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir {#MyAppName} ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Solo cachés que la app regenera; la sesión y la licencia NO se tocan.
Type: filesandordirs; Name: "{app}\resources\app-update.yml"
