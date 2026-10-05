$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot 'dist'
$packagePath = Join-Path $outputDir 'moyun-blog-tencent.zip'

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path $packagePath) {
  Remove-Item $packagePath -Force
}

$items = @(
  'admin.html',
  'blog.html',
  'index.html',
  'package.json',
  'server.js',
  'ecosystem.config.cjs',
  'nginx.conf.example',
  'README.txt',
  'css',
  'js'
)

$paths = $items | ForEach-Object { Join-Path $projectRoot $_ }
Compress-Archive -Path $paths -DestinationPath $packagePath -CompressionLevel Optimal
Write-Output $packagePath
