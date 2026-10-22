# Rebuild the approved seal logo with a transparent outer background.
# Run on Windows with Georgia installed. Generated files are committed directly.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$outputDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$culture = [System.Globalization.CultureInfo]::InvariantCulture
function Format-Point($point) {
    $point.X.ToString('0.###', $culture) + ' ' + $point.Y.ToString('0.###', $culture)
}

$family = [System.Drawing.FontFamily]::new('Georgia')
$glyph = [System.Drawing.Drawing2D.GraphicsPath]::new()
$ascent = 48 * $family.GetCellAscent([System.Drawing.FontStyle]::Regular) / $family.GetEmHeight([System.Drawing.FontStyle]::Regular)
$glyph.AddString([string][char]0x042D, $family, 0, 48, [System.Drawing.PointF]::new(0, (47 - $ascent)), [System.Drawing.StringFormat]::GenericTypographic)
$bounds = $glyph.GetBounds()
$translation = [System.Drawing.Drawing2D.Matrix]::new()
$translation.Translate((32 - $bounds.Left - $bounds.Width / 2), 0)
$glyph.Transform($translation)
$translation.Dispose()
$family.Dispose()

$points = $glyph.PathPoints
$types = $glyph.PathTypes
$segments = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $points.Length; $i++) {
    switch ($types[$i] -band 7) {
        0 { $segments.Add('M' + (Format-Point $points[$i])) }
        1 { $segments.Add('L' + (Format-Point $points[$i])) }
        3 {
            $segments.Add('C' + (Format-Point $points[$i]) + ' ' + (Format-Point $points[$i + 1]) + ' ' + (Format-Point $points[$i + 2]))
            $i += 2
        }
        default { throw 'Unsupported glyph contour.' }
    }
    if ($types[$i] -band 128) { $segments.Add('Z') }
}
$pathData = $segments -join ' '
$svg = @"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 256 256">
  <title>Эстетика</title>
  <circle cx="128" cy="128" r="113" fill="#a23b4e"/>
  <path fill="#fff9f0" transform="translate(128 128) scale(5.1) translate(-32 -30.4)" d="$pathData"/>
</svg>
"@
[System.IO.File]::WriteAllText((Join-Path $outputDirectory 'favicon.svg'), $svg + "`n", [System.Text.UTF8Encoding]::new($false))

$master = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$drawing = [System.Drawing.Graphics]::FromImage($master)
$drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$drawing.ScaleTransform(4, 4)
$background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#a23b4e'))
$foreground = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#fff9f0'))
$drawing.Clear([System.Drawing.Color]::Transparent)
$drawing.FillEllipse($background, 15, 15, 226, 226)
$sealTransform = [System.Drawing.Drawing2D.Matrix]::new(5.1, 0, 0, 5.1, -35.2, -27.04)
$glyph.Transform($sealTransform)
$sealTransform.Dispose()
$drawing.FillPath($foreground, $glyph)
$drawing.Dispose()
$background.Dispose()
$foreground.Dispose()
$glyph.Dispose()

function Get-IconPng([int]$size) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
    $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $graphics.DrawImage($master, [System.Drawing.Rectangle]::new(0, 0, $size, $size), 0, 0, $master.Width, $master.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
    $attributes.Dispose()
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $bytes = $stream.ToArray()
    $stream.Dispose()
    return ,$bytes
}
[System.IO.File]::WriteAllBytes((Join-Path $outputDirectory 'favicon.png'), (Get-IconPng 120))
[System.IO.File]::WriteAllBytes((Join-Path $outputDirectory 'apple-touch-icon.png'), (Get-IconPng 180))
$master.Save((Join-Path $outputDirectory 'logo-estetika.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$sizes = @(16, 32, 48, 64, 128, 256)
$frames = @($sizes | ForEach-Object { ,(Get-IconPng $_) })
$iconStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($iconStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Length)
$offset = 6 + 16 * $sizes.Length
for ($i = 0; $i -lt $sizes.Length; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frames[$i].Length)
    $writer.Write([uint32]$offset)
    $offset += $frames[$i].Length
}
foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $outputDirectory 'favicon.ico'), $iconStream.ToArray())
$writer.Dispose()
$iconStream.Dispose()
$master.Dispose()
Write-Output 'Prepared transparent seal logo: PNG 1024, SVG outlines, PNG 120, Apple icon 180 and ICO 16/32/48/64/128/256.'
