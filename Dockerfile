FROM alpine:latest
LABEL maintainer="xj9264"

# 安装必要工具
RUN apk add --no-cache \
    nginx \
    git \
    ca-certificates \
    nodejs \
    npm \
    curl \
    su-exec \
    shadow \
    util-linux

# 全局安装hexo-cli和pm2
RUN npm install -g hexo-cli pm2

# 创建初始用户和组（使用1000 ID 减少误判）
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# 创建必要的目录
RUN mkdir -p /app/hexo && \
    mkdir -p /var/log/nginx && \
    mkdir -p /var/lib/nginx && \
    mkdir -p /run/nginx

# 复制nginx配置文件
COPY hexo.conf /etc/nginx/http.d/hexo.conf

# 复制webhook.js到/app
COPY webhook.js /app/webhook.js

# 复制entrypoint.sh
COPY entrypoint.sh /entrypoint.sh

# 设置工作目录
WORKDIR /app

# 设置entrypoint权限
RUN chmod +x /entrypoint.sh

# 暴露端口（nginx和webhook）
EXPOSE 8081

ENTRYPOINT ["/entrypoint.sh"]