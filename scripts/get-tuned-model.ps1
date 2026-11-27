# Download the fine-tuned generic checkpoint from this repository's release and check it.
[CmdletBinding()]
param(
    [string]$Destination = (Join-Path (Split-Path $PSScriptRoot -Parent) 'models/epoch-084.pt')
)

$ErrorActionPreference = 'Stop'
$url = 'https://github.com/abdalrahman-ismaik/RayGuard-App/releases/download/tuned-model-v1/epoch-084.pt'
$expected = '097ff71eb741ce51ba053bc77512ba0916772c69ae8b4d7d50c0ef497e3f65f8'

$Destination = [System.IO.Path]::GetFullPath($Destination)
if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and
    (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $expected) {
    Write-Host "Tuned model already present and verified: $Destination"
    exit 0
}
New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
$partial = "$Destination.partial"
Write-Host 'Downloading the tuned model (133 MB)...'
try {
    Invoke-WebRequest -Uri $url -OutFile $partial -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
    if ($actual -ne $expected) {
        throw "SHA-256 mismatch: expected $expected, got $actual. The file was not kept."
    }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
} finally {
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
}
Write-Host "Tuned model saved and verified: $Destination"
Write-Host 'Set "model_id": "author-yolov10m-generic-tuned" and this checkpoint in config.local.json.'
