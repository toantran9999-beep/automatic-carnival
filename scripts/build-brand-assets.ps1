# Sinh toàn bộ biểu tượng app (web favicon, PWA, icon APK Android) từ logo gốc của quán.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-brand-assets.ps1
#
# Logo gốc: logo/logoden.png — hình cây trong vòng tròn, nền trong suốt, màu than chì.
# Logo đổi thì chạy lại lệnh trên, không phải sửa tay file nào.
#
# Dùng System.Drawing (có sẵn trên Windows) — không cần cài thêm gì.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root      = Split-Path -Parent $PSScriptRoot
$srcPath   = Join-Path $root "logo\logoden.png"
$webPublic = Join-Path $root "apps\web\public"
$androidRes = Join-Path $root "pos-android\app\src\main\res"

$BG   = [System.Drawing.ColorTranslator]::FromHtml("#1C1917")  # nền biểu tượng (khớp theme_color trong manifest)
$MARK = [System.Drawing.ColorTranslator]::FromHtml("#F4F2EC")  # màu logo trên nền tối

if (-not (Test-Path $srcPath)) { throw "Khong tim thay logo goc: $srcPath" }

function New-Dir($path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

# Giữ nguyên độ trong suốt (hình dáng logo), thay toàn bộ màu bằng $color.
function Get-TintedMark {
  param([System.Drawing.Bitmap]$Source, [System.Drawing.Color]$Color)

  $out = New-Object System.Drawing.Bitmap($Source.Width, $Source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Source.Width, $Source.Height)

  $sd = $Source.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $od = $out.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $len = [Math]::Abs($sd.Stride) * $Source.Height
    $buf = New-Object byte[] $len
    [System.Runtime.InteropServices.Marshal]::Copy($sd.Scan0, $buf, 0, $len)
    # Bo nho anh xep theo thu tu BGRA
    for ($i = 0; $i -lt $len; $i += 4) {
      if ($buf[$i + 3] -gt 0) {
        $buf[$i]     = $Color.B
        $buf[$i + 1] = $Color.G
        $buf[$i + 2] = $Color.R
      }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $od.Scan0, $len)
  } finally {
    $Source.UnlockBits($sd)
    $out.UnlockBits($od)
  }
  return $out
}

function New-RoundedPath {
  param([single]$Size, [single]$Radius)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($Radius -le 0) {
    $path.AddRectangle((New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)))
    return $path
  }
  $d = $Radius * 2
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

# Ve mot bieu tuong: nen (tuy chon) + logo can giua theo ti le MarkScale.
function New-Icon {
  param(
    [System.Drawing.Bitmap]$Mark,
    [int]$Size,
    [double]$MarkScale,
    [string]$OutPath,
    [double]$CornerPct = 0.0,     # ti le bo goc so voi canh; 0 = vuong
    [switch]$NoBackground         # khong ve nen (dung cho lop truoc cua icon thich ung)
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if (-not $NoBackground) {
      $path = New-RoundedPath -Size ([single]$Size) -Radius ([single]($Size * $CornerPct))
      $brush = New-Object System.Drawing.SolidBrush($BG)
      try { $g.FillPath($brush, $path) } finally { $brush.Dispose(); $path.Dispose() }
    }

    $inner = [int][Math]::Round($Size * $MarkScale)
    $off = [int][Math]::Round(($Size - $inner) / 2.0)
    $dest = New-Object System.Drawing.Rectangle($off, $off, $inner, $inner)

    # WrapMode TileFlipXY: tranh vien mo khi thu nho anh co kenh trong suot
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    try {
      $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $g.DrawImage($Mark, $dest, 0, 0, $Mark.Width, $Mark.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
    } finally { $attr.Dispose() }
  } finally { $g.Dispose() }

  New-Dir (Split-Path -Parent $OutPath)
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-52} {1}x{1}" -f (Resolve-Path -Relative $OutPath), $Size)
}

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$markLight = $null
try {
  $markLight = Get-TintedMark -Source $src -Color $MARK

  Write-Host "`n== Web / PWA =="
  # Ban goc, nen trong suot — dung lam mat na (mask) cho giao dien, tu doi mau theo nen
  New-Dir (Join-Path $webPublic "brand")
  Copy-Item $srcPath (Join-Path $webPublic "brand\mark.png") -Force
  Write-Host ("  {0,-52} {1}x{1}" -f "apps\web\public\brand\mark.png", $src.Width)

  New-Icon -Mark $markLight -Size 192 -MarkScale 0.76 -CornerPct 0.225 -OutPath (Join-Path $webPublic "icon-192.png")
  New-Icon -Mark $markLight -Size 512 -MarkScale 0.76 -CornerPct 0.225 -OutPath (Join-Path $webPublic "icon-512.png")
  # maskable: Android cat bo phan ria -> logo phai nam gon trong vong tron giua khung
  New-Icon -Mark $markLight -Size 512 -MarkScale 0.58 -CornerPct 0.0   -OutPath (Join-Path $webPublic "icon-maskable-512.png")
  # iOS khong hieu nen trong suot va tu bo goc -> nen duc, goc vuong
  New-Icon -Mark $markLight -Size 180 -MarkScale 0.76 -CornerPct 0.0   -OutPath (Join-Path $webPublic "apple-touch-icon.png")
  New-Icon -Mark $markLight -Size 32  -MarkScale 0.80 -CornerPct 0.225 -OutPath (Join-Path $webPublic "favicon-32.png")

  Write-Host "`n== APK 'TODA POS Quay' =="
  $densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
  foreach ($d in @("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")) {
    New-Icon -Mark $markLight -Size $densities[$d] -MarkScale 0.76 -CornerPct 0.225 `
      -OutPath (Join-Path $androidRes "mipmap-$d\ic_launcher.png")
  }
  # Icon thich ung (Android 8+): chi ve lop truoc, nen lay tu @color/ic_launcher_background
  New-Icon -Mark $markLight -Size 432 -MarkScale 0.58 -NoBackground `
    -OutPath (Join-Path $androidRes "drawable\ic_launcher_foreground.png")

  Write-Host "`nXong."
} finally {
  if ($markLight) { $markLight.Dispose() }
  $src.Dispose()
}
