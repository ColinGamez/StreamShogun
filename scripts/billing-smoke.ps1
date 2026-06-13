param(
  [string]$ApiBase = "http://localhost:8787",
  [string]$EnvPath = "apps/api/.env",
  [string]$SiteRoot = "site",
  [string]$Email = "",
  [string]$Password = ("Smoke" + "Test" + "123!"),
  [switch]$AllowLive,
  [switch]$OpenCheckout,
  [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Pass($Message) {
  Write-Host "PASS $Message" -ForegroundColor Green
}

function Write-WarnLine($Message) {
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Write-Fail($Message) {
  Write-Host "FAIL $Message" -ForegroundColor Red
}

function Read-DotEnv($Path) {
  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }

  return $map
}

function Require-Env($Env, $Name, $Prefix = "") {
  if (-not $Env.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Env[$Name])) {
    Write-Fail "$Name is missing in $EnvPath"
    return $false
  }
  if ($Prefix -and -not $Env[$Name].StartsWith($Prefix)) {
    Write-Fail "$Name must start with '$Prefix'"
    return $false
  }
  Write-Pass "$Name is set"
  return $true
}

function Assert-Rewrite($ConfigPath, $Source, $Destination) {
  if (-not (Test-Path $ConfigPath)) {
    Write-Fail "$ConfigPath is missing"
    return $false
  }

  $json = Get-Content $ConfigPath -Raw | ConvertFrom-Json
  $match = @($json.rewrites) | Where-Object {
    $_.source -eq $Source -and $_.destination -eq $Destination
  } | Select-Object -First 1

  if ($null -eq $match) {
    Write-Fail "$ConfigPath missing rewrite $Source -> $Destination"
    return $false
  }

  Write-Pass "$ConfigPath has rewrite $Source"
  return $true
}

function Invoke-Json($Method, $Uri, $Headers = @{}, $Body = $null) {
  try {
    $args = @{
      Method = $Method
      Uri = $Uri
      Headers = $Headers
      TimeoutSec = 30
    }

    if ($null -ne $Body) {
      $args["ContentType"] = "application/json"
      $args["Body"] = ($Body | ConvertTo-Json -Depth 8)
    }

    return Invoke-RestMethod @args
  } catch {
    $status = "unknown"
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $details = $_.ErrorDetails.Message
    if ([string]::IsNullOrWhiteSpace($details)) {
      $details = $_.Exception.Message
    }
    throw "HTTP $status from $Uri - $details"
  }
}

Write-Host "StreamShogun billing smoke test"
Write-Host "API: $ApiBase"
Write-Host "Env: $EnvPath"

$envMap = Read-DotEnv $EnvPath
$failed = $false
$stripeLiveSecretPrefix = "sk_" + "live_"

Write-Step "Checking billing environment"

foreach ($check in @(
  @{ Name = "STRIPE_SECRET_KEY"; Prefix = "sk_" },
  @{ Name = "STRIPE_WEBHOOK_SECRET"; Prefix = "whsec_" }
)) {
  if (-not (Require-Env $envMap $check.Name $check.Prefix)) {
    $failed = $true
  }
}

$hasMonthly = Require-Env $envMap "STRIPE_PRICE_ID_PRO_MONTHLY" "price_"
$hasYearly = Require-Env $envMap "STRIPE_PRICE_ID_PRO_YEARLY" "price_"
if (-not $hasMonthly -and -not $hasYearly) {
  $failed = $true
}

if ($envMap.ContainsKey("BILLING_DISABLED") -and $envMap["BILLING_DISABLED"] -eq "true") {
  Write-Fail "BILLING_DISABLED=true; checkout and portal routes will return 503"
  $failed = $true
}

if ($envMap.ContainsKey("STRIPE_SECRET_KEY") -and $envMap["STRIPE_SECRET_KEY"].StartsWith($stripeLiveSecretPrefix) -and -not $AllowLive) {
  Write-Fail "Refusing to run against a live Stripe key without -AllowLive"
  $failed = $true
}

if (-not $envMap.ContainsKey("APP_PUBLIC_URL") -or [string]::IsNullOrWhiteSpace($envMap["APP_PUBLIC_URL"])) {
  Write-WarnLine "APP_PUBLIC_URL is not set; API will fall back to CORS_ORIGIN for checkout return URLs"
} else {
  Write-Pass "APP_PUBLIC_URL is set"
}

Write-Step "Checking checkout return pages"

foreach ($file in @("billing/success.html", "billing/cancel.html")) {
  $path = Join-Path $SiteRoot $file
  if (Test-Path $path) {
    Write-Pass "$path exists"
  } else {
    Write-Fail "$path is missing"
    $failed = $true
  }
}

if (-not (Assert-Rewrite "vercel.json" "/billing/success" "/billing/success.html")) { $failed = $true }
if (-not (Assert-Rewrite "vercel.json" "/billing/cancel" "/billing/cancel.html")) { $failed = $true }
if (-not (Assert-Rewrite (Join-Path $SiteRoot "vercel.json") "/billing/success" "/billing/success.html")) { $failed = $true }
if (-not (Assert-Rewrite (Join-Path $SiteRoot "vercel.json") "/billing/cancel" "/billing/cancel.html")) { $failed = $true }

if ($failed) {
  Write-Host ""
  Write-Fail "Preflight failed. Add/fix the items above, then rerun this script."
  exit 1
}

if ($PreflightOnly) {
  Write-Step "Preflight only"
  Write-Pass "Billing config and static return pages are ready"
  exit 0
}

Write-Step "Checking API health"

try {
  $health = Invoke-Json "GET" "$ApiBase/healthz"
  if ($health.db -ne $true) {
    Write-Fail "API responded, but db=false"
    exit 1
  }
  if ($health.billingEnabled -ne $true) {
    Write-Fail "API responded, but billingEnabled=false"
    exit 1
  }
  Write-Pass "API health is good and billing is enabled"
} catch {
  Write-Fail "Could not reach API at $ApiBase"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Start dependencies with:"
  Write-Host "  pnpm db:up"
  Write-Host "  pnpm db:push"
  Write-Host "  pnpm dev:api"
  exit 1
}

Write-Step "Creating smoke account"

if ([string]::IsNullOrWhiteSpace($Email)) {
  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  $Email = "billing-smoke+$stamp@example.test"
}

$auth = Invoke-Json "POST" "$ApiBase/v1/auth/register" @{} @{
  email = $Email
  password = $Password
  displayName = "Billing Smoke"
}

if (-not $auth.accessToken) {
  Write-Fail "Register response did not include an access token"
  exit 1
}

Write-Pass "Smoke account registered: $Email"
$headers = @{ Authorization = "Bearer $($auth.accessToken)" }

Write-Step "Creating Stripe Checkout Sessions"

$intervals = @()
if ($hasMonthly) { $intervals += "monthly" }
if ($hasYearly) { $intervals += "yearly" }
$firstCheckoutUrl = ""

foreach ($interval in $intervals) {
  $checkout = Invoke-Json "POST" "$ApiBase/v1/billing/checkout" $headers @{
    interval = $interval
  }

  if (-not $checkout.url -or -not $checkout.url.StartsWith("https://checkout.stripe.com/")) {
    Write-Fail "$interval checkout did not return a Stripe Checkout URL"
    exit 1
  }

  Write-Pass "$interval checkout URL created"
  if ([string]::IsNullOrWhiteSpace($firstCheckoutUrl)) {
    $firstCheckoutUrl = $checkout.url
  }
}

if ($OpenCheckout -and -not [string]::IsNullOrWhiteSpace($firstCheckoutUrl)) {
  Write-Pass "Opening first Checkout URL in your default browser"
  Start-Process $firstCheckoutUrl
}

Write-Step "Creating Stripe Portal Session"

$portal = Invoke-Json "POST" "$ApiBase/v1/billing/portal" $headers @{}
if (-not $portal.url -or -not $portal.url.StartsWith("https://billing.stripe.com/")) {
  Write-Fail "Portal did not return a Stripe Billing Portal URL"
  exit 1
}

Write-Pass "Portal URL created"

Write-Host ""
Write-Pass "Billing smoke test passed"
if (-not $OpenCheckout) {
  Write-Host "Tip: rerun with -OpenCheckout to open the first Checkout URL in your browser."
}
Write-Host "Next manual step: pay with Stripe test card 4242 4242 4242 4242, then confirm /v1/features returns PRO after the webhook lands."
