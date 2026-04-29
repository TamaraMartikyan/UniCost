
; installer.nsh — auto-installs ODBC Driver for SQL Server if missing

!macro customInstall
    DetailPrint "Checking for Microsoft ODBC Driver for SQL Server..."

    ReadRegStr $0 HKLM "SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" "Driver"
    ${If} $0 == ""
        ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" "Driver"
    ${EndIf}
    ${If} $0 == ""
        ReadRegStr $0 HKLM "SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server" "Driver"
    ${EndIf}
    ${If} $0 == ""
        ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server" "Driver"
    ${EndIf}

    ${If} $0 != ""
        DetailPrint "ODBC Driver already installed: $0"
    ${Else}
        DetailPrint "ODBC Driver not found. Attempting install..."

        ; ── Option A: bundled MSI ──────────────────────────────────────
        ${If} ${FileExists} "$INSTDIR\resources\redist\msodbcsql17.msi"
            DetailPrint "Installing from bundled MSI..."
            ExecWait '"msiexec.exe" /i "$INSTDIR\resources\redist\msodbcsql17.msi" /quiet /norestart IACCEPTMSODBCSQLLICENSETERMS=YES' $1
            ${If} $1 == 0
                DetailPrint "ODBC Driver installed from bundle."
                Goto odbc_done
            ${EndIf}
        ${EndIf}

        ; ── Options B+C: write a PS1 helper, run it ───────────────────
        ; Writing to a file avoids all NSIS quote-nesting problems.
        ; $$ in FileWrite strings → single $ in the output file.
        DetailPrint "Running PowerShell ODBC installer..."
        FileOpen $2 "$TEMP\unicost_odbc.ps1" w
        FileWrite $2 "$$ErrorActionPreference='SilentlyContinue'$\r$\n"
        FileWrite $2 "function Check-ODBC {$\r$\n"
        FileWrite $2 "    (Get-ItemProperty 'HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server' -EA SilentlyContinue) -or$\r$\n"
        FileWrite $2 "    (Get-ItemProperty 'HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server' -EA SilentlyContinue)$\r$\n"
        FileWrite $2 "}$\r$\n"
        FileWrite $2 "if (Check-ODBC) { exit 0 }$\r$\n"
        FileWrite $2 "winget install --id Microsoft.ODBCDriverforSQLServer --silent --accept-package-agreements --accept-source-agreements 2>$$null$\r$\n"
        FileWrite $2 "if (Check-ODBC) { exit 0 }$\r$\n"
        FileWrite $2 "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n"
        FileWrite $2 "$$msi = Join-Path $$env:TEMP 'msodbcsql18.msi'$\r$\n"
        FileWrite $2 "bitsadmin /transfer ODBCDl /download /priority FOREGROUND 'https://go.microsoft.com/fwlink/?linkid=2214634' $$msi 2>$$null$\r$\n"
        FileWrite $2 "if (Test-Path $$msi) { Start-Process msiexec.exe -ArgumentList '/i',$$msi,'/quiet','/norestart','IACCEPTMSODBCSQLLICENSETERMS=YES' -Wait }$\r$\n"
        FileWrite $2 "if (Check-ODBC) { exit 0 } else { exit 1 }$\r$\n"
        FileClose $2

        ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\unicost_odbc.ps1"' $1
        Delete "$TEMP\unicost_odbc.ps1"

        ${If} $1 == 0
            DetailPrint "ODBC Driver installed successfully."
            Goto odbc_done
        ${EndIf}

        ; ── Nothing worked ─────────────────────────────────────────────
        MessageBox MB_OK|MB_ICONEXCLAMATION "Could not auto-install Microsoft ODBC Driver for SQL Server.$\n$\nPlease install it manually from:$\nhttps://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server$\n$\nThen re-launch UniCost."

        odbc_done:
    ${EndIf}
!macroend

!macro customUnInstall
!macroend
