param(
  [switch]$KeepCompilerPackage
)

$ErrorActionPreference = "Stop"

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$bscPackage = Join-Path $appRoot "dist\StreamShogun-roku-bsc.zip"

Write-Host "Running BrighterScript validation..."
npx --yes brighterscript --project (Join-Path $appRoot "bsconfig.json")

if ((Test-Path -LiteralPath $bscPackage) -and -not $KeepCompilerPackage) {
  Remove-Item -LiteralPath $bscPackage -Force
}

Write-Host "Building sideload package..."
& (Join-Path $PSScriptRoot "package.ps1")

$package = Join-Path $appRoot "dist\StreamShogun-roku.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($package)
try {
  $entries = $archive.Entries
  $manifest = $entries | Where-Object { $_.FullName -eq "manifest" }
  if ($manifest.Count -ne 1) {
    throw "Package must contain exactly one manifest at the ZIP root."
  }

  $requiredEntries = @(
    "components\MainScene.xml",
    "components\AccountScene.xml",
    "components\RokuPayScene.xml",
    "components\tasks\AccountSessionTask.xml",
    "components\tasks\ValidateRokuPayTask.xml",
    "components\ManagePlaylistsScene.xml",
    "components\tasks\FetchLibraryTask.xml",
    "components\tasks\ResolveDeepLinkTask.xml",
    "source\main.brs",
    "images\icon_focus_fhd.png",
    "images\splash_fhd.jpg"
  )

  foreach ($entryName in $requiredEntries) {
    if (-not ($entries | Where-Object { $_.FullName -eq $entryName })) {
      throw "Package missing required entry: $entryName"
    }
  }

  [pscustomobject]@{
    package = $package
    entries = $entries.Count
    bytes = (Get-Item -LiteralPath $package).Length
    manifestAtRoot = $true
  } | Format-List
} finally {
  $archive.Dispose()
}
