$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'frontend/out')).Path
$files = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -Force)
if ($files.Count -gt 1000) { throw 'Pages dashboard upload supports at most 1000 files.' }
foreach ($file in $files) {
    if ($file.Length -gt 25MB) { throw "Pages asset exceeds 25 MiB: $($file.Name)" }
}
foreach ($required in @('index.html', '_headers', '404.html', 'demo/room-plan.dxf')) {
    if (!(Test-Path -LiteralPath (Join-Path $sourceRoot $required) -PathType Leaf)) { throw "Missing export: $required" }
}

$releaseName = 'pages-release-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$releaseDir = Join-Path (Join-Path $repoRoot 'tmp') $releaseName
New-Item -ItemType Directory -Path $releaseDir | Out-Null
$archivePath = Join-Path $releaseDir 'mybuild-pages.zip'
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $archivePath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Read the ZIP back and compare every entry with its exported source.
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
$manifest = @()
try {
    $entries = @($zip.Entries | Where-Object { $_.Name -ne '' })
    if ($entries.Count -ne $files.Count) { throw 'ZIP file count differs from export.' }
    $seen = @{}
    foreach ($entry in $entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($seen.ContainsKey($name) -or $name.StartsWith('/') -or $name.Split('/') -contains '..') { throw "Invalid archive entry: $name" }
        $seen[$name] = $true
        $sourcePath = Join-Path $sourceRoot $name
        $expected = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $stream = $entry.Open()
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $actual = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose(); $stream.Dispose() }
        if ($actual -ne $expected) { throw "ZIP content differs: $name" }
        $manifest += [ordered]@{ path = $name; bytes = $entry.Length; sha256 = $actual }
    }
    if (!$seen.ContainsKey('index.html') -or !$seen.ContainsKey('_headers')) { throw 'ZIP must contain export files at its root.' }
} finally { $zip.Dispose() }

Copy-Item -LiteralPath (Join-Path $repoRoot 'tmp/demo-audit.json') -Destination (Join-Path $releaseDir 'demo-audit.json')
$release = [ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString('o')
    archive = 'mybuild-pages.zip'
    archiveBytes = (Get-Item -LiteralPath $archivePath).Length
    archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    fileCount = $files.Count
    files = $manifest
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $releaseDir 'release-manifest.json'), ($release | ConvertTo-Json -Depth 5), $utf8)
[System.IO.File]::WriteAllText((Join-Path $repoRoot 'tmp/pages-release-latest.txt'), $releaseDir, $utf8)
Write-Output "Verified ZIP: $archivePath"
Write-Output "Files: $($files.Count); bytes: $($release.archiveBytes); SHA256: $($release.archiveSha256)"
Write-Output 'Upload only mybuild-pages.zip. The manifest and audit stay local. Nothing was published.'
