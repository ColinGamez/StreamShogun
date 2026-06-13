param(
  [string]$OutputDir = "$PSScriptRoot\..\dist",
  [switch]$SkipAssetGeneration
)

$ErrorActionPreference = "Stop"

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDir)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

if (-not $SkipAssetGeneration) {
  & (Join-Path $PSScriptRoot "create-assets.ps1") -OutputDir (Join-Path $appRoot "images")
}

$required = @(
  "manifest",
  "source\main.brs",
  "components\MainScene.xml",
  "components\PlayerScene.xml",
  "images\icon_focus_fhd.png",
  "images\icon_focus_hd.png",
  "images\icon_focus_sd.png",
  "images\icon_side_hd.png",
  "images\icon_side_sd.png",
  "images\splash_fhd.jpg",
  "images\splash_hd.jpg",
  "images\splash_sd.jpg"
)

foreach ($relativePath in $required) {
  $path = Join-Path $appRoot $relativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required Roku package file is missing: $relativePath"
  }
}

$xmlFiles = Get-ChildItem -LiteralPath (Join-Path $appRoot "components") -Recurse -Filter "*.xml"
foreach ($xmlFile in $xmlFiles) {
  try {
    [xml](Get-Content -LiteralPath $xmlFile.FullName -Raw) | Out-Null
  } catch {
    throw "Invalid XML in $($xmlFile.FullName): $($_.Exception.Message)"
  }
}

$zipPath = Join-Path $resolvedOutput "StreamShogun-roku.zip"
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("streamshogun-roku-" + [System.Guid]::NewGuid().ToString("N"))
[System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null

try {
  Copy-Item -LiteralPath (Join-Path $appRoot "manifest") -Destination $tempRoot
  Copy-Item -LiteralPath (Join-Path $appRoot "source") -Destination $tempRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $appRoot "components") -Destination $tempRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $appRoot "images") -Destination $tempRoot -Recurse

  Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $zipPath -Force
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Host "Created Roku sideload package: $zipPath"
