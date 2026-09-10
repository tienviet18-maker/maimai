Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$srcPath = 'C:\Users\tienv\.cursor\projects\c-Users-tienv-OneDrive-Desktop-WellnessApp-Store\assets\maimai-icon-source.png'
$base = 'C:\Users\tienv\OneDrive\Desktop\WellnessApp_Store\www\icons'
if (!(Test-Path $base)) { New-Item -ItemType Directory -Path $base | Out-Null }

$src = [System.Drawing.Image]::FromFile($srcPath)

function Save-Resized([System.Drawing.Image]$img, [int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 236, 72, 153))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $size, $size)
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output "saved $outPath"
}

Save-Resized $src 180 "$base\apple-touch-icon-180.png"
Save-Resized $src 192 "$base\icon-192.png"
Save-Resized $src 512 "$base\icon-512.png"
Copy-Item -Force "$base\apple-touch-icon-180.png" "$base\apple-touch-icon.png"
$src.Dispose()
Get-ChildItem $base | Format-Table Name, Length
