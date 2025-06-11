#!/bin/sh

# 从环境变量获取配置（设置默认值）
USER_ID=${UID:-1000}
GROUP_ID=${GID:-1000}
GIT_REPO=${GIT_REPO:-}
GIT_USER=${GIT_USER:-}
GIT_PASSWORD=${GIT_PASSWORD:-}
PORT=${PORT:-8081}
HEXO_DIR=${HEXO_DIR:-/app/hexo}
HOST=${HOST:-localhost}

echo "Starting as UID: $USER_ID, GID: $GROUP_ID"
echo "Git Repository: $GIT_REPO"
echo "Nginx Port: $PORT"
echo "Hexo Directory: $HEXO_DIR"

# 4. 修改appuser的UID和主组
if [ "$(id -u appuser)" != "$USER_ID" ] || \
   [ "$(id -g appuser)" != "$GROUP_ID" ]; then
    echo "Updating appuser UID to: $USER_ID, GID: $GROUP_ID"
    deluser appuser
	delgroup appgroup
	addgroup -g "$GROUP_ID" appgroup
    adduser -u "$USER_ID" -G appgroup -s /bin/sh -D -h /app appuser
fi

# 5. 修复目录权限
echo "Fixing directory permissions..."
chown -R $USER_ID:$GROUP_ID /app
chown -R $USER_ID:$GROUP_ID /var/log/nginx
chown -R $USER_ID:$GROUP_ID /var/lib/nginx
chown -R $USER_ID:$GROUP_ID /run/nginx
chown -R $USER_ID:$GROUP_ID /etc/nginx
# 确保 /tmp 目录有正确权限
chown -R $USER_ID:$GROUP_ID /tmp

# 6. 更新nginx端口配置
echo "Updating nginx port to $PORT..."
sed -i "s/listen 8081;/listen $PORT;/g" /etc/nginx/http.d/hexo.conf
sed -i "s/server_name localhost;/server_name $HOST;/g" /etc/nginx/http.d/hexo.conf

# 7. 克隆/更新hexo项目（支持Git认证）
if [ -n "$GIT_REPO" ]; then
    # 构建认证URL（如果提供了用户名和密码）
    if [ -n "$GIT_USER" ] && [ -n "$GIT_PASSWORD" ]; then
        # 提取协议和路径
        REPO_PROTOCOL=$(echo "$GIT_REPO" | awk -F/ '{print $1}')
        REPO_PATH=$(echo "$GIT_REPO" | cut -d/ -f3-)
        AUTH_GIT_REPO="${REPO_PROTOCOL}//${GIT_USER}:${GIT_PASSWORD}@${REPO_PATH}"
    else
        AUTH_GIT_REPO="$GIT_REPO"
    fi

    if [ -d "$HEXO_DIR/.git" ]; then
        echo "Updating existing hexo repository..."
        # 设置Git凭据缓存（避免每次操作都需要认证）
        su-exec appuser git config --global credential.helper 'store --file /tmp/git-credentials'
        echo "$AUTH_GIT_REPO" > /tmp/git-credentials
        
        su-exec appuser sh -c "cd $HEXO_DIR && git pull"
    else
        echo "Cloning new hexo repository: $GIT_REPO"
        su-exec appuser git clone "$AUTH_GIT_REPO" "$HEXO_DIR"
    fi
    
    # 8. 安装依赖并生成静态文件
    if [ -d "$HEXO_DIR" ]; then
        echo "Installing hexo dependencies..."
        su-exec appuser sh -c "cd $HEXO_DIR && npm install"
        
        echo "Generating hexo static files..."
        su-exec appuser sh -c "cd $HEXO_DIR && hexo clean && hexo generate"
    else
        echo "Hexo directory not found: $HEXO_DIR"
    fi
else
    echo "Skipping hexo setup: GIT_REPO not provided"
fi

# 9. 启动webhook服务
echo "Starting webhook service..."
su-exec appuser pm2 start /app/webhook.js --name webhook

# 10. 启动nginx（保持前台运行）
echo "Starting nginx..."
exec su-exec appuser nginx -g 'daemon off;'