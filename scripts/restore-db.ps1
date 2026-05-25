param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

function Get-EnvDatabaseUrl {
  if ($env:DATABASE_URL) {
    return $env:DATABASE_URL
  }

  if (Test-Path ".env") {
    foreach ($line in Get-Content ".env") {
      if ($line -match "^DATABASE_URL=(.+)$") {
        return $Matches[1].Trim('"')
      }
    }
  }

  throw "DATABASE_URL is required"
}

function Resolve-SqlitePath {
  param([string]$DatabaseUrl)

  if ($DatabaseUrl -notmatch "^file:(.+)$") {
    throw "DATABASE_URL must use file: for SQLite restore"
  }

  $path = $Matches[1]
  if ([System.IO.Path]::IsPathRooted($path)) {
    return $path
  }

  return Join-Path "prisma" $path
}

if (-not (Test-Path -LiteralPath $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$databaseUrl = Get-EnvDatabaseUrl
$dbPath = Resolve-SqlitePath $databaseUrl
$dbDir = Split-Path -Parent $dbPath

if ($dbDir) {
  New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
}

Copy-Item -LiteralPath $BackupFile -Destination $dbPath -Force

Write-Output "Restore completed to: $dbPath"
