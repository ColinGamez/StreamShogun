param(
  [Parameter(Mandatory = $true)]
  [Alias("Host")]
  [string]$DeviceHost,

  [string]$Password = $env:ROKU_DEV_PASSWORD,
  [string]$Package = "$PSScriptRoot\..\dist\StreamShogun-roku.zip",
  [switch]$SkipPackage,
  [switch]$Launch
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Password)) {
  throw "Missing developer password. Pass -Password or set ROKU_DEV_PASSWORD."
}

$packagePath = [System.IO.Path]::GetFullPath($Package)

if (-not $SkipPackage) {
  & (Join-Path $PSScriptRoot "package.ps1")
}

if (-not (Test-Path -LiteralPath $packagePath)) {
  throw "Roku package not found: $packagePath"
}

$installerUrl = "http://$DeviceHost/plugin_install"
Write-Host "Uploading $packagePath to $installerUrl"

$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl -eq $null) {
  throw "curl.exe is required for Roku sideload upload on Windows."
}

$output = & curl.exe -sS `
  -u "rokudev:$Password" `
  -F "mysubmit=Install" `
  -F "archive=@$packagePath" `
  $installerUrl

if ($LASTEXITCODE -ne 0) {
  throw "Roku upload failed with exit code $LASTEXITCODE"
}

Write-Host $output

if ($output -match "Install Failure|Failed|Error") {
  throw "Roku installer returned a failure response."
}

Write-Host "Upload complete."

if ($Launch) {
  Write-Host "Launching sideloaded channel via ECP..."
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Method Post -Uri "http://$DeviceHost`:8060/launch/dev" | Out-Null
}
