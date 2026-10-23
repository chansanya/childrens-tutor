#!/usr/bin/env bash
# 在服务器上执行：解压发布包 → 构建镜像 → 启动容器 → 健康检查
# 用法：bash remote.sh /tmp/childrens-tutor.tgz
set -euo pipefail

PKG=${1:-/tmp/childrens-tutor.tgz}
APP_DIR=${APP_DIR:-/opt/childrens-tutor}
HOST_PORT=${HOST_PORT:-3000}

command -v docker >/dev/null || { echo "未安装 docker" >&2; exit 1; }
[ -f "$PKG" ] || { echo "找不到发布包 $PKG" >&2; exit 1; }

mkdir -p "$APP_DIR/data/config" "$APP_DIR/data/logs" "$APP_DIR/data/images"
rm -rf "$APP_DIR/app"
# 发布包在 Windows 打包，忽略包内权限，按服务器 umask 落地
tar --no-same-permissions -xzf "$PKG" -C "$APP_DIR"

# 首次部署：初始化角色配置与空的 .env；之后保留服务器上的修改
[ -f "$APP_DIR/data/config/roles.json" ] || cp "$APP_DIR/roles.default.json" "$APP_DIR/data/config/roles.json"
[ -f "$APP_DIR/.env" ] || install -m 600 /dev/null "$APP_DIR/.env"

cd "$APP_DIR"
export HOST_PORT
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$HOST_PORT/api/roles"; then
    echo "部署成功：http://$(hostname -I | awk '{print $1}'):$HOST_PORT"
    exit 0
  fi
  sleep 2
done

echo "健康检查失败，最近日志：" >&2
docker compose logs --tail 50 >&2
exit 1
