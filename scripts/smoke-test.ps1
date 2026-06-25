$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$candidateDirs = @(
  (Join-Path $root 'dist-zhan\win-unpacked'),
  (Join-Path $root 'dist\win-unpacked')
)
$unpackedDir = $candidateDirs | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $unpackedDir) {
  throw "Missing packaged app. Run npm.cmd run dist first."
}

$appExe = Get-ChildItem -LiteralPath $unpackedDir -Filter '*.exe' -File |
  Sort-Object Length -Descending |
  Select-Object -First 1

if (-not $appExe) {
  throw "Missing packaged exe in dist\win-unpacked. Run npm.cmd run dist first."
}

$originalClipboard = $null
$hadTextClipboard = $false

function Stop-TestApp {
  Get-Process |
    Where-Object { $_.Path -like (Join-Path $unpackedDir '*') } |
    Stop-Process -Force -ErrorAction SilentlyContinue

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*double-tab-listener.ps1*' } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

try {
  try {
    $originalClipboard = Get-Clipboard -Raw -ErrorAction Stop
    $hadTextClipboard = $true
  } catch {
    $hadTextClipboard = $false
  }

  $testText = "CODEX_TEXT_SMOKE_TEST_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

  Start-Process -FilePath $appExe.FullName
  Start-Sleep -Seconds 3
  Set-Clipboard -Value $testText
  Start-Sleep -Seconds 4
  Stop-TestApp
  Start-Sleep -Seconds 1

  $foundPath = $null
  $foundItems = @()
  $historyFiles = Get-ChildItem -LiteralPath $env:APPDATA -Recurse -Filter 'history.json' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*clipboard-data*' }

  foreach ($historyFile in $historyFiles) {
    try {
      $history = Get-Content -Encoding UTF8 -LiteralPath $historyFile.FullName -Raw | ConvertFrom-Json
      $items = @($history)
      $matched = @($items | Where-Object { $_.type -eq 'text' -and $_.text -eq $testText })

      if ($matched.Count -gt 0) {
        $foundPath = $historyFile.FullName
        $foundItems = $items
        break
      }
    } catch {
      # Ignore unrelated or broken history files during smoke testing.
    }
  }

  if (-not $foundPath) {
    throw "Smoke test failed. Test text was not found in clipboard history."
  }

  [PSCustomObject]@{
    Passed = $true
    AppExe = $appExe.FullName
    HistoryPath = $foundPath
    TestText = $testText
    HistoryCount = $foundItems.Count
    LatestType = if ($foundItems.Count -gt 0) { $foundItems[0].type } else { '' }
  } | ConvertTo-Json -Depth 4
} finally {
  if ($hadTextClipboard) {
    Set-Clipboard -Value $originalClipboard
  }

  Stop-TestApp
}
