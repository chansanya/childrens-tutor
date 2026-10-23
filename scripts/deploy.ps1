# 构建并打包发布文件：release/childrens-tutor.tgz
# 传入 -Server 时通过 scp/ssh 直接发布（需已配置免密登录），例如：
#   powershell -File scripts/deploy.ps1 -Server root@your-server
param([string]$Server)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$env:BUILD_STANDALONE = '1'
npm run build
if ($LASTEXITCODE) { throw '构建失败' }
Remove-Item Env:BUILD_STANDALONE

$out = Join-Path $root 'release'
$pkg = Join-Path $out 'pkg'
$tgz = Join-Path $out 'childrens-tutor.tgz'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory "$pkg/app/.next-release" | Out-Null

Copy-Item -Recurse -Force '.next-release/standalone/*' "$pkg/app"
Copy-Item -Recurse '.next-release/static' "$pkg/app/.next-release/static"
# 密钥与本地配置不进发布包，服务器上的配置来自挂载卷与服务器自己的 .env
Get-ChildItem "$pkg/app" -Filter '.env*' -Force | Remove-Item -Force
if (Test-Path "$pkg/app/config") { Remove-Item -Recurse -Force "$pkg/app/config" }
# 本地运行产生的审计日志与图片会被依赖追踪带入，一并剔除
if (Test-Path "$pkg/app/data") { Remove-Item -Recurse -Force "$pkg/app/data" }

Copy-Item 'deploy/*' $pkg
Copy-Item 'config/roles.json' "$pkg/roles.default.json"

tar -czf $tgz -C $pkg .
if ($LASTEXITCODE) { throw '打包失败' }
Write-Host ("发布包：{0}（{1:N1} MB）" -f $tgz, ((Get-Item $tgz).Length / 1MB))

if ($Server) {
  scp $tgz "${Server}:/tmp/childrens-tutor.tgz"
  if ($LASTEXITCODE) { throw '上传失败' }
  ssh $Server 'mkdir -p /opt/childrens-tutor && tar --no-same-permissions -xzf /tmp/childrens-tutor.tgz -C /opt/childrens-tutor ./remote.sh && bash /opt/childrens-tutor/remote.sh /tmp/childrens-tutor.tgz'
  if ($LASTEXITCODE) { throw '远程部署失败' }
}
