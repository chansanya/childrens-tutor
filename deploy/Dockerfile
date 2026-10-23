# 仅运行时镜像：应用已在本地以 standalone 模式构建好，服务器上无需 npm install
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    CONFIG_DIR=/data/config

COPY app/ ./

EXPOSE 3000
CMD ["node", "server.js"]
