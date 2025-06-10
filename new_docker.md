根据您的需求，我将提供一个完整的Alpine-based解决方案，包括Dockerfile和entrypoint.sh，满足所有要求：

### Dockerfile
```dockerfile
FROM alpine:latest

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

# 创建初始用户和组（使用高ID避免冲突）
RUN addgroup -g 10000 appgroup && \
    adduser -u 10000 -G appgroup -s /bin/sh -D appuser

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
EXPOSE 8081 9000

ENTRYPOINT ["/entrypoint.sh"]
```

### entrypoint.sh
```bash
#!/bin/sh

# 从环境变量获取UID和GID（设置默认值）
USER_ID=${UID:-10000}
GROUP_ID=${GID:-10000}
GIT_REPO=${GIT_REPO:-}
PORT=${PORT:-8081}
HEXO_DIR=${HEXO_DIR:-/app/hexo}

echo "Starting as UID: $USER_ID, GID: $GROUP_ID"
echo "Git Repository: $GIT_REPO"
echo "Nginx Port: $PORT"
echo "Hexo Directory: $HEXO_DIR"

# 1. 处理组冲突
if getent group "$GROUP_ID" >/dev/null; then
    existing_group=$(getent group "$GROUP_ID" | cut -d: -f1)
    if [ "$existing_group" != "appgroup" ]; then
        echo "Removing conflicting group: $existing_group (GID: $GROUP_ID)"
        delgroup "$existing_group"
    fi
fi

# 2. 修改appgroup的GID
if [ "$(getent group appgroup | cut -d: -f3)" != "$GROUP_ID" ]; then
    echo "Updating appgroup GID to: $GROUP_ID"
    delgroup appgroup
    addgroup -g "$GROUP_ID" appgroup
fi

# 3. 处理用户冲突
if getent passwd "$USER_ID" >/dev/null; then
    existing_user=$(getent passwd "$USER_ID" | cut -d: -f1)
    if [ "$existing_user" != "appuser" ]; then
        echo "Removing conflicting user: $existing_user (UID: $USER_ID)"
        deluser "$existing_user"
    fi
fi

# 4. 修改appuser的UID和主组
if [ "$(id -u appuser)" != "$USER_ID" ] || \
   [ "$(id -g appuser)" != "$GROUP_ID" ]; then
    echo "Updating appuser UID to: $USER_ID, GID: $GROUP_ID"
    deluser appuser
    adduser -u "$USER_ID" -G appgroup -s /bin/sh -D -h /app appuser
fi

# 5. 修复目录权限
echo "Fixing directory permissions..."
chown -R $USER_ID:$GROUP_ID /app
chown -R $USER_ID:$GROUP_ID /var/log/nginx
chown -R $USER_ID:$GROUP_ID /var/lib/nginx
chown -R $USER_ID:$GROUP_ID /run/nginx
chown -R $USER_ID:$GROUP_ID /etc/nginx

# 6. 更新nginx端口配置
echo "Updating nginx port to $PORT..."
sed -i "s/listen 8081;/listen $PORT;/g" /etc/nginx/http.d/hexo.conf

# 7. 克隆/更新hexo项目
if [ -n "$GIT_REPO" ]; then
    if [ -d "$HEXO_DIR/.git" ]; then
        echo "Updating existing hexo repository..."
        su-exec appuser sh -c "cd $HEXO_DIR && git pull"
    else
        echo "Cloning new hexo repository: $GIT_REPO"
        su-exec appuser git clone "$GIT_REPO" "$HEXO_DIR"
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
```

### webhook.js
```javascript
const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.WEBHOOK_PORT || 9000;
const HEXO_DIR = process.env.HEXO_DIR || '/app/hexo';
const GIT_REPO = process.env.GIT_REPO;

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        console.log('Received webhook request');
        
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                handleWebhook(payload, res);
            } catch (e) {
                console.error('Error parsing webhook payload:', e);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
});

function handleWebhook(payload, res) {
    // 验证事件类型（这里以GitHub为例）
    const isPushEvent = req.headers['x-github-event'] === 'push';
    
    if (isPushEvent) {
        console.log('Processing push event');
        
        const commands = [
            `cd ${HEXO_DIR}`,
            'git pull',
            'npm install',
            'hexo clean',
            'hexo generate'
        ];
        
        exec(commands.join(' && '), { 
            env: { ...process.env, PATH: process.env.PATH },
            uid: process.env.UID ? parseInt(process.env.UID) : 10000,
            gid: process.env.GID ? parseInt(process.env.GID) : 10000
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing commands: ${error}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'error', 
                    error: error.message,
                    stderr 
                }));
                return;
            }
            
            console.log('Hexo regeneration completed');
            console.log(stdout);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                status: 'success', 
                output: stdout 
            }));
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ignored', event: 'non-push' }));
    }
}

server.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
    console.log(`HEXO_DIR: ${HEXO_DIR}`);
    console.log(`GIT_REPO: ${GIT_REPO || 'Not set'}`);
});
```

### hexo.conf (Nginx配置文件)
```nginx
server {
    listen 8081;
    server_name localhost;
    
    root /app/hexo/public;
    index index.html index.htm;
    
    access_log /var/log/nginx/hexo.access.log;
    error_log /var/log/nginx/hexo.error.log;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location = /webhook {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 构建和运行命令

1. **构建镜像**：
```bash
docker build -t hexo-blog .
```

2. **运行容器**：
```bash
docker run -d --name hexo-blog \
  -e UID=$(id -u) \
  -e GID=$(id -g) \
  -e GIT_REPO=https://github.com/yourname/your-hexo-repo.git \
  -e PORT=8081 \
  -e HEXO_DIR=/app/hexo \
  -p 8080:8081 \
  -p 9000:9000 \
  -v $(pwd)/hexo-data:/app/hexo \
  hexo-blog
```

### 功能说明

1. **权限管理**：
   - 使用传递的UID/GID动态创建用户和组
   - 所有文件和目录权限都设置为指定UID/GID
   - 使用`su-exec`以正确用户身份执行命令

2. **工作流程**：
   - 克隆/更新GitHub上的Hexo项目
   - 安装npm依赖
   - 生成静态文件
   - 启动Nginx提供静态文件服务
   - 启动webhook服务接受更新通知

3. **Webhook功能**：
   - 监听POST请求（默认端口9000）
   - 接收GitHub webhook事件
   - 自动拉取最新代码并重新生成静态文件
   - 使用相同的UID/GID执行命令，保持权限一致

4. **环境变量**：
   - `UID`：用户ID
   - `GID`：组ID
   - `GIT_REPO`：GitHub仓库地址
   - `PORT`：Nginx监听端口（默认8081）
   - `HEXO_DIR`：Hexo项目目录（默认/app/hexo）

5. **目录结构**：
   - `/app`：应用主目录
   - `/app/webhook.js`：webhook服务脚本
   - `/app/hexo`：Hexo项目目录
   - `/etc/nginx/http.d/hexo.conf`：Nginx配置文件

此解决方案完全满足您的需求，使用Alpine基础镜像，正确处理权限问题，并实现了自动化的Hexo博客构建和更新流程。