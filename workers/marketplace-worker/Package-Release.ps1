$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $workerRoot)
$destination = Join-Path $repoRoot "public\downloads\ferocity-marketplace-worker-0.4.0.zip"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("ferocity-marketplace-worker-" + [guid]::NewGuid().ToString("N"))
$packageRoot = Join-Path $stage "ferocity-marketplace-worker"

New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
foreach ($name in @("src", "scripts", "test")) {
  Copy-Item -LiteralPath (Join-Path $workerRoot $name) -Destination $packageRoot -Recurse
}
foreach ($name in @("package.json", "package-lock.json", "worker.config.example.json", "README.md", "Start-Ferocity-Worker.cmd", "Configure-Ferocity-Worker.cmd", "Show-Ferocity-Worker-Logs.cmd", "Install-Logon-Task.ps1", "Uninstall-Logon-Task.ps1")) {
  Copy-Item -LiteralPath (Join-Path $workerRoot $name) -Destination $packageRoot
}

if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
Compress-Archive -LiteralPath $packageRoot -DestinationPath $destination -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host "Created $destination"
