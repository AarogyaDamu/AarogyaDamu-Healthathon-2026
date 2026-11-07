Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = Join-Path (Get-Location).Path 'aarogyadamu-final-submission.zip'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)

$forbiddenPatterns = @('node_modules', '.git/', '.git\', 'dist/', 'dist\', '.expo/', '.expo\', '.db')
$foundForbidden = @()
$keyFiles = @('README.md', 'package.json', 'docs/FHIR-R4.md', 'docs/LOINC-MAPPINGS.md', 'docs/EVALUATOR-GUIDE.md', 'packages/contracts/src/terminology.ts', 'services/api/src/fhir/mapper.ts')
$foundKeyFiles = @()

$totalEntries = $zip.Entries.Count

foreach ($entry in $zip.Entries) {
    foreach ($f in $forbiddenPatterns) {
        if ($entry.FullName.Contains($f)) {
            $foundForbidden += $entry.FullName
        }
    }
    foreach ($k in $keyFiles) {
        $normalized = $entry.FullName.Replace('\', '/')
        if ($normalized -eq $k) {
            $foundKeyFiles += $k
        }
    }
}

$zip.Dispose()

Write-Host "Total ZIP Entries: $totalEntries"
Write-Host "Forbidden Patterns Found: $($foundForbidden.Count)"
Write-Host "Key Files Confirmed: $($foundKeyFiles.Count) / $($keyFiles.Count)"
foreach ($kf in $foundKeyFiles) {
    Write-Host "  - [x] $kf"
}

if ($foundForbidden.Count -gt 0) {
    Write-Host "Forbidden sample:"
    $foundForbidden | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" }
    exit 1
} else {
    Write-Host "ZIP verification PASSED! Clean archive with zero forbidden files."
    exit 0
}

