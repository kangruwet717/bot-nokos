param(
  [string]$OutputDir = "backups"
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
    throw "DATABASE_URL must use file: for SQLite backups"
  }

  $path = $Matches[1]
  if ([System.IO.Path]::IsPathRooted($path)) {
    return $path
  }

  return Join-Path "prisma" $path
}

$databaseUrl = Get-EnvDatabaseUrl
$dbPath = Resolve-SqlitePath $databaseUrl

if (-not (Test-Path -LiteralPath $dbPath)) {
  throw "SQLite database file not found: $dbPath"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$output = Join-Path $OutputDir "botnokos_$timestamp.db"

Copy-Item -LiteralPath $dbPath -Destination $output -Force

Write-Output "Backup created: $output"
