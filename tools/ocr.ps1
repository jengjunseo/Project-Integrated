param([string]$InputDirectory,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await($op,$type) { $task=$asTask.MakeGenericMethod($type).Invoke($null,@($op));$task.Wait();$task.Result }
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ko'))
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
foreach($file in Get-ChildItem -LiteralPath $InputDirectory -Filter '*.jpg') {
 $dest=Join-Path $OutputDirectory ($file.BaseName+'.json')
 if((Test-Path -LiteralPath $dest) -and ((Get-Content -LiteralPath $dest -Raw | ConvertFrom-Json).width -gt 0)){continue}
 $f=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file.FullName)) ([Windows.Storage.StorageFile])
 $stream=Await ($f.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
 $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
 $lines=@($result.Lines | ForEach-Object { @{text=$_.Text; words=@($_.Words | ForEach-Object {@{text=$_.Text; x=$_.BoundingRect.X;y=$_.BoundingRect.Y;width=$_.BoundingRect.Width;height=$_.BoundingRect.Height}})} })
 @{file=$file.Name;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;angle=$result.TextAngle;lines=$lines;text=$result.Text} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $dest -Encoding UTF8
 $stream.Dispose();$bitmap.Dispose()
 Write-Output $file.Name
}
