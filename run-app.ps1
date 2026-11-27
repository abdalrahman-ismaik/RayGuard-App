# One entry point for the local Windows app. The model environment stays separate.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8765,
    [string]$Config,
    [switch]$SkipBuild,
    [switch]$SetupModel,
    [ValidatePattern('^(auto|cpu|cuda:[0-9]+)$')]
    [string]$InferenceDevice
)

$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$engineRoot = Join-Path $appRoot 'engine'
$appUrl = "http://127.0.0.1:$Port"
$explicitConfig = $PSBoundParameters.ContainsKey('Config')
$explicitDevice = $PSBoundParameters.ContainsKey('InferenceDevice')
$exitCode = 0

function Invoke-Checked {
    param([string]$Executable, [string[]]$CommandArgs)
    & $Executable @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed (exit $LASTEXITCODE). Startup stopped."
    }
}

# Every launch starts fresh. Stop RayGuard service processes left by earlier launches,
# including their child processes and whatever holds the port. Only processes whose
# command line names the RayGuard service are stopped; any other program on the port
# stops the launch with an error.
function Stop-PreviousRayGuard {
    param([int]$Port)
    $self = $PID
    $marker = 'rayguard[-_]gui'
    $all = @(Get-CimInstance Win32_Process)
    $targets = @{}
    foreach ($process in $all) {
        if ($process.ProcessId -ne $self -and $process.CommandLine -match $marker) {
            $targets[[int]$process.ProcessId] = $true
        }
    }
    $listeners = @()
    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique)
    } catch {
        $listeners = @()
    }
    foreach ($listener in $listeners) {
        $owner = $all | Where-Object { $_.ProcessId -eq $listener } | Select-Object -First 1
        if ($null -eq $owner) { continue }
        if ($owner.CommandLine -match $marker) {
            $targets[[int]$listener] = $true
        } else {
            throw "Port $Port is used by another program (PID $listener). Choose another port, for example: .\run-app.ps1 -Port 8766"
        }
    }
    if ($targets.Count -eq 0) { return }
    # uv starts the Python service as a child process, so stop the whole tree.
    $queue = [System.Collections.Generic.Queue[int]]::new()
    foreach ($key in @($targets.Keys)) { $queue.Enqueue([int]$key) }
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq $parent })) {
            if ($child.ProcessId -ne $self -and -not $targets.ContainsKey([int]$child.ProcessId)) {
                $targets[[int]$child.ProcessId] = $true
                $queue.Enqueue([int]$child.ProcessId)
            }
        }
    }
    Write-Host "Stopping $($targets.Count) earlier RayGuard process(es) before starting a fresh session..."
    foreach ($key in @($targets.Keys)) {
        Stop-Process -Id $key -Force -ErrorAction SilentlyContinue
    }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $still = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if ($still.Count -eq 0) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "Port $Port is still in use after stopping RayGuard. Close the other program or choose another port."
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $engineRoot 'pyproject.toml') -PathType Leaf)) {
        throw 'The pinned engine is missing. Run git submodule update --init --recursive from this checkout, then rerun the launcher.'
    }
    if ($explicitConfig) {
        $Config = [System.IO.Path]::GetFullPath($Config)
        if (-not $SetupModel -and -not (Test-Path -LiteralPath $Config -PathType Leaf)) {
            throw 'Config must point to a local JSON file.'
        }
    } else {
        $Config = Join-Path $appRoot 'config.local.json'
        $managedConfig = Join-Path $appRoot 'config.managed.local.json'
        if ($SetupModel -or (Test-Path -LiteralPath $managedConfig -PathType Leaf) -or
            -not (Test-Path -LiteralPath $Config -PathType Leaf)) {
            $Config = $managedConfig
            if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) { $SetupModel = $true }
        }
    }

    # Stop earlier RayGuard processes so every launch starts a fresh session.
    Stop-PreviousRayGuard -Port $Port
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $probe.Start()
    } catch {
        throw "Port $Port is in use. Choose another port, for example: .\run-app.ps1 -Port 8766"
    } finally {
        $probe.Stop()
    }

    $uv = Get-Command uv -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $uv) { throw 'Install uv, then reopen this terminal. See README.md.' }
    Invoke-Checked $uv.Source @('run', '--project', (Join-Path $appRoot 'backend'), '--locked',
        'python', '-m', 'rayguard_gui.engine')
    if ($SetupModel) {
        $previousConfig = Join-Path $appRoot 'config.local.json'
        $sourceConfig = Join-Path $appRoot 'config.example.json'
        if (Test-Path -LiteralPath $Config -PathType Leaf) {
            $sourceConfig = $Config
        } elseif (Test-Path -LiteralPath $previousConfig -PathType Leaf) {
            $sourceConfig = $previousConfig
        }
        $setupArgs = @('run', '--project', (Join-Path $appRoot 'backend'), '--locked', 'python',
            (Join-Path $engineRoot 'scripts/setup_model_runtime.py'), '--root', $engineRoot,
            '--config', $Config, '--source-config', $sourceConfig, '--managed')
        if ($explicitDevice) { $setupArgs += @('--device', $InferenceDevice) }
        Write-Host 'Checking hardware and required disk space for the isolated model runtime...'
        Invoke-Checked $uv.Source ($setupArgs + @('--dry-run'))
        Write-Host 'Preparing locked model packages. Ctrl+C cancels; existing configuration is preserved.'
        Invoke-Checked $uv.Source $setupArgs
        Write-Host 'Runtime prepared. Real model verification is still required in the app.'
    }
    if (-not $SkipBuild) {
        $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $npm) { throw 'Install Node.js 22.12+ (includes npm), then reopen this terminal.' }
        Write-Host 'Preparing the locked frontend dependencies and production build...'
        Invoke-Checked $npm.Source @('--prefix', (Join-Path $appRoot 'frontend'), 'ci')
        Invoke-Checked $npm.Source @('--prefix', (Join-Path $appRoot 'frontend'), 'run', 'build')
    } elseif (-not (Test-Path -LiteralPath (Join-Path $appRoot 'frontend/dist/index.html'))) {
        throw 'No built frontend found. Run .\run-app.ps1 without -SkipBuild first.'
    }

    $arguments = @('run', '--project', (Join-Path $appRoot 'backend'), '--locked',
        'rayguard-gui', '--port', "$Port", '--workspace-restart')
    if (Test-Path -LiteralPath $Config -PathType Leaf) {
        $arguments += @('--config', $Config)
        Write-Host 'Using the local model configuration.'
    } else {
        Write-Host 'No local model configuration; the UI will open with inference unavailable.'
    }
    Write-Host "Starting RayGuard at $appUrl (Ctrl+C stops the service)."
    # Supervise this child only. Exit 75 means an explicit workspace restart was accepted.
    # A command-line override applies to the initial session; a saved workspace choice
    # takes effect on the deliberate restart. Never restart ordinary exits or crashes.
    $initialLaunch = $true
    do {
        $launchArguments = $arguments
        if ($initialLaunch -and $explicitDevice) {
            $launchArguments += @('--device', $InferenceDevice)
        }
        & $uv.Source @launchArguments
        $serviceExit = $LASTEXITCODE
        $initialLaunch = $false
        if ($serviceExit -eq 75) {
            Write-Host 'Applying the saved model and inference device to a new RayGuard session...'
        } elseif ($serviceExit -ne 0) {
            throw "RayGuard service failed (exit $serviceExit). Restart stopped."
        }
    } while ($serviceExit -eq 75)
} catch {
    Write-Host "RayGuard: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}
exit $exitCode
