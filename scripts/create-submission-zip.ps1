$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = (Get-Location).Path
$stagingDir = Join-Path $env:TEMP "aarogyadamu_submission_staging_$(Get-Random)"

Write-Host "Creating staging directory at $stagingDir..."
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

$excludeDirNames = @('node_modules', '.git', 'dist', '.expo', 'coverage', '.vitest', 'backups', '.turbo')
$excludeFilePatterns = @('*.db', '*.db-*', '*.sqlite', '*.sqlite3', '*.log', '*.zip', '*.tsbuildinfo')

Get-ChildItem -Path $repoRoot -Recurse | ForEach-Object {
    $item = $_
    $relPath = $item.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    
    # Check if any segment of relative path is in excluded directories
    $segments = $relPath -split '[\\/]'
    $skip = $false
    foreach ($seg in $segments) {
        if ($excludeDirNames -contains $seg) {
            $skip = $true
            break
        }
    }

    # Check file pattern exclusions
    if (-not $skip -and -not $item.PSIsContainer) {
        foreach ($pat in $excludeFilePatterns) {
            if ($item.Name -like $pat) {
                $skip = $true
                break
            }
        }
    }

    # Specifically exclude any uploads in private except .gitkeep
    if ($relPath -like 'services*api*uploads*private*' -and $item.Name -ne '.gitkeep') {
        $skip = $true
    }

    if (-not $skip) {
        $targetPath = Join-Path $stagingDir $relPath
        if ($item.PSIsContainer) {
            if (-not (Test-Path $targetPath)) {
                New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
            }
        } else {
            $targetParent = Split-Path $targetPath -Parent
            if (-not (Test-Path $targetParent)) {
                New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
            }
            Copy-Item -Path $item.FullName -Destination $targetPath -Force
        }
    }
}

$zipTarget = Join-Path $repoRoot 'aarogyadamu-final-submission.zip'
Write-Host "Packaging clean submission archive to $zipTarget..."
if (Test-Path $zipTarget) {
    Remove-Item -Force $zipTarget
}

[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $zipTarget, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$desktopTarget = 'C:\Users\prana\Desktop\aarogyadamu-final-submission.zip'
try {
    Write-Host "Copying submission archive to $desktopTarget..."
    Copy-Item -Path $zipTarget -Destination $desktopTarget -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "Desktop copy skipped (sandbox or lock): $zipTarget is ready."
}

Remove-Item -Recurse -Force $stagingDir

$zipInfo = Get-Item $zipTarget
Write-Host "Archive created successfully:"
Write-Host "  Path: $($zipInfo.FullName)"
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB"
