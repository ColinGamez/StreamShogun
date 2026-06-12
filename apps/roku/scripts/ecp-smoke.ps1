param(
  [Parameter(Mandatory = $true)]
  [Alias("Host")]
  [string]$DeviceHost,

  [string]$ContentId = "",
  [string]$MediaType = "movie",
  [switch]$Launch,
  [switch]$HomeAfter
)

$ErrorActionPreference = "Stop"

function Invoke-EcpPost([string]$Path) {
  $uri = "http://$DeviceHost`:8060$Path"
  Write-Host "POST $uri"
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Method Post -Uri $uri | Out-Null
}

function Invoke-EcpGet([string]$Path) {
  $uri = "http://$DeviceHost`:8060$Path"
  Write-Host "GET $uri"
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $uri
}

function Try-EcpGet([string]$Path) {
  try {
    return Invoke-EcpGet $Path
  } catch {
    Write-Warning "GET $Path failed: $($_.Exception.Message)"
    return $null
  }
}

function Try-EcpPost([string]$Path) {
  try {
    Invoke-EcpPost $Path
    return $true
  } catch {
    Write-Warning "POST $Path failed: $($_.Exception.Message)"
    return $false
  }
}

$deviceInfo = Try-EcpGet "/query/device-info"
if ($deviceInfo -ne $null) {
  Write-Host $deviceInfo.Content
}

$apps = Try-EcpGet "/query/apps"
if ($apps -ne $null -and $apps.Content -notmatch ">StreamSh") {
  Write-Host "StreamShogun was not found in /query/apps yet. If it was just sideloaded, try -Launch or relaunch from the Roku UI."
} elseif ($apps -eq $null) {
  Write-Host "Skipping /query/apps validation. Some TVs block this command when ECP setting mode is Limited."
}

if ($Launch) {
  if ($ContentId -ne "") {
    $encodedContentId = [System.Uri]::EscapeDataString($ContentId)
    $encodedMediaType = [System.Uri]::EscapeDataString($MediaType)
    Try-EcpPost "/launch/dev?contentId=$encodedContentId&mediaType=$encodedMediaType" | Out-Null
  } else {
    Try-EcpPost "/launch/dev" | Out-Null
  }

  Start-Sleep -Seconds 2
  Try-EcpPost "/keypress/Down" | Out-Null
  Start-Sleep -Milliseconds 400
  Try-EcpPost "/keypress/Up" | Out-Null
  Start-Sleep -Milliseconds 400
  Try-EcpPost "/keypress/Select" | Out-Null
}

if ($HomeAfter) {
  Start-Sleep -Seconds 1
  Try-EcpPost "/keypress/Home" | Out-Null
}
