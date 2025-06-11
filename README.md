# Nginx-Hexo

Nginx 做前端代理，使用node server监听Github的webhook。只要Github有push便会拉取最新代码并生成hexo页面。

## 如何使用
可选参数：
1. `HOST`hexo绑定的域名
2. `GITREPO`hexo网站远程git地址
3. `GIT_USER`拉取git更新时，做用户验证的用户名
4. `GIT_PASSWORD`拉取git更新时，做用户验证的用户密码

```
docker run -d --name hexo-blog \
  -e UID=$(id -u) \
  -e GID=$(id -g) \
  -e GIT_REPO=https://github.com/yourname/your-hexo-repo.git \
  -e PORT=8081 \
  -e HEXO_DIR=/app/hexo \
  -p 8080:8081 \
  -v $(pwd)/hexo-data:/app/hexo \
  hexo-blog
```
docker compose用法参考项目内示例的`compose.yml`：
```yml
name: nginx-hexo
services:
    nginx-hexo:
        container_name: nginx-hexo
        environment:
            - UID=1000
            - GID=1000
            - GIT_REPO=https://git.xj9264.xyz/myproj/hexo.git
            - GIT_USER=test1234
            - GIT_PASSWORD=test1234
            - PORT=8081
            - HEXO_DIR=/app/hexo
        ports:
            - 8080:8081
            # - 9000:9000
        # volumes:
            # - $(pwd)/hexo-data:/app/hexo
        image: nginx-hexo
```
