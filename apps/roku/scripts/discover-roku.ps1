param(
  [int]$TimeoutSeconds = 4
)

$ErrorActionPreference = "Stop"

$client = [System.Net.Sockets.UdpClient]::new()
$client.EnableBroadcast = $true
$client.Client.ReceiveTimeout = 1000

$multicastEndpoint = [System.Net.IPEndPoint]::new(
  [System.Net.IPAddress]::Parse("239.255.255.250"),
  1900
)

$request = @(
  "M-SEARCH * HTTP/1.1",
  "HOST: 239.255.255.250:1900",
  "MAN: ""ssdp:discover""",
  "MX: 2",
  "ST: roku:ecp",
  "",
  ""
) -join "`r`n"

$bytes = [System.Text.Encoding]::ASCII.GetBytes($request)
[void]$client.Send($bytes, $bytes.Length, $multicastEndpoint)

$seen = @{}
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

try {
  while ((Get-Date) -lt $deadline) {
    $remote = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
    try {
      $responseBytes = $client.Receive([ref]$remote)
    } catch {
      continue
    }

    $ip = $remote.Address.ToString()
    if ($seen.ContainsKey($ip)) {
      continue
    }

    $text = [System.Text.Encoding]::ASCII.GetString($responseBytes)
    $headers = @{}
    foreach ($line in ($text -split "`r?`n")) {
      $colon = $line.IndexOf(":")
      if ($colon -gt 0) {
        $key = $line.Substring(0, $colon).Trim().ToLowerInvariant()
        $value = $line.Substring($colon + 1).Trim()
        $headers[$key] = $value
      }
    }

    $info = [ordered]@{
      ip = $ip
      ecp = "http://$ip`:8060"
      location = $headers["location"]
      server = $headers["server"]
      usn = $headers["usn"]
      model = ""
      software = ""
      name = ""
    }

    try {
      [xml]$deviceInfo = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://$ip`:8060/query/device-info" | Select-Object -ExpandProperty Content
      $info.model = $deviceInfo."device-info"."model-name"
      $info.software = $deviceInfo."device-info"."software-version"
      $info.name = $deviceInfo."device-info"."user-device-name"
    } catch {
      # SSDP discovery is still useful even if ECP detail query fails.
    }

    $seen[$ip] = $info
  }
} finally {
  $client.Close()
}

if ($seen.Count -eq 0) {
  Write-Host "No Roku devices discovered via SSDP."
  exit 1
}

$seen.Values | ForEach-Object { [pscustomobject]$_ } | Format-Table -AutoSize
