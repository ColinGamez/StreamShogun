param(
  [string]$OutputDir = "$PSScriptRoot\..\images"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDir)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
$brandName = "StreamSh" + [char]0x014D + "gun"

function New-Brush([string]$hex) {
  return New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function New-Pen([string]$hex, [float]$width) {
  return New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($hex), $width)
}

function Draw-CenteredText($graphics, [string]$text, $font, $brush, [System.Drawing.RectangleF]$rect) {
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose()
}

function Save-Png($bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-Jpeg($bitmap, [string]$path, [long]$quality = 92) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1
  $encoder = [System.Drawing.Imaging.Encoder]::Quality
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, $quality)
  $bitmap.Save($path, $codec, $params)
  $params.Dispose()
}

function New-ChannelIcon([int]$width, [int]$height, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Brush "#0c0c0e"
  $surface = New-Brush "#111114"
  $accent = New-Brush "#7c5cfc"
  $accentPen = New-Pen "#7c5cfc" ([Math]::Max(3, $width * 0.012))
  $text = New-Brush "#f4f4f5"
  $muted = New-Brush "#a1a1aa"

  $graphics.FillRectangle($bg, 0, 0, $width, $height)
  $pad = [int]($width * 0.075)
  $graphics.FillRectangle($surface, $pad, $pad, $width - ($pad * 2), $height - ($pad * 2))
  $graphics.DrawRectangle($accentPen, $pad, $pad, $width - ($pad * 2), $height - ($pad * 2))

  $markSize = [int]($height * 0.34)
  $markRect = [System.Drawing.RectangleF]::new(($width - $markSize) / 2, $height * 0.16, $markSize, $markSize)
  $graphics.FillEllipse($accent, $markRect)

  $markFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(18, $markSize * 0.44), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  Draw-CenteredText $graphics "S" $markFont $text $markRect

  $titleFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(18, $height * 0.10), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(10, $height * 0.045), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  Draw-CenteredText $graphics $script:brandName $titleFont $text ([System.Drawing.RectangleF]::new(0, $height * 0.53, $width, $height * 0.14))
  Draw-CenteredText $graphics "Personal Playlist Player" $subFont $muted ([System.Drawing.RectangleF]::new(0, $height * 0.68, $width, $height * 0.12))

  Save-Png $bitmap $path

  $markFont.Dispose()
  $titleFont.Dispose()
  $subFont.Dispose()
  $bg.Dispose()
  $surface.Dispose()
  $accent.Dispose()
  $accentPen.Dispose()
  $text.Dispose()
  $muted.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function New-Splash([int]$width, [int]$height, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Brush "#0c0c0e"
  $surface = New-Brush "#111114"
  $accent = New-Brush "#7c5cfc"
  $text = New-Brush "#f4f4f5"
  $muted = New-Brush "#a1a1aa"

  $graphics.FillRectangle($bg, 0, 0, $width, $height)
  $bandHeight = [int]($height * 0.36)
  $graphics.FillRectangle($surface, 0, ($height - $bandHeight) / 2, $width, $bandHeight)

  $markSize = [int]($height * 0.18)
  $markRect = [System.Drawing.RectangleF]::new(($width - $markSize) / 2, $height * 0.30, $markSize, $markSize)
  $graphics.FillEllipse($accent, $markRect)

  $markFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(36, $markSize * 0.45), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $titleFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(42, $height * 0.07), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(22, $height * 0.032), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  Draw-CenteredText $graphics "S" $markFont $text $markRect
  Draw-CenteredText $graphics $script:brandName $titleFont $text ([System.Drawing.RectangleF]::new(0, $height * 0.50, $width, $height * 0.10))
  Draw-CenteredText $graphics "Personal Playlist Player" $subFont $muted ([System.Drawing.RectangleF]::new(0, $height * 0.61, $width, $height * 0.07))

  Save-Jpeg $bitmap $path

  $markFont.Dispose()
  $titleFont.Dispose()
  $subFont.Dispose()
  $bg.Dispose()
  $surface.Dispose()
  $accent.Dispose()
  $text.Dispose()
  $muted.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-ChannelIcon 540 405 (Join-Path $resolvedOutput "icon_focus_fhd.png")
New-ChannelIcon 290 218 (Join-Path $resolvedOutput "icon_focus_hd.png")
New-ChannelIcon 214 144 (Join-Path $resolvedOutput "icon_focus_sd.png")
New-ChannelIcon 336 210 (Join-Path $resolvedOutput "icon_side_hd.png")
New-ChannelIcon 248 140 (Join-Path $resolvedOutput "icon_side_sd.png")
New-Splash 1920 1080 (Join-Path $resolvedOutput "splash_fhd.jpg")
New-Splash 1280 720 (Join-Path $resolvedOutput "splash_hd.jpg")
New-Splash 720 480 (Join-Path $resolvedOutput "splash_sd.jpg")

Write-Host "Generated Roku image assets in $resolvedOutput"
