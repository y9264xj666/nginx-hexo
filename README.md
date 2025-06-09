# Nginx-Hexo

Nginx 做前端代理，使用node server监听Github的webhook。只要Github有push便会拉取最新代码并生成hexo页面。

## 如何使用
可选参数：
1. `HOST`hexo绑定的域名
2. `GITREPO`hexo网站远程git地址
3. `GIT_USERNAME`拉取git更新时，做用户验证的用户名
4. `GIT_PASSWD`拉取git更新时，做用户验证的用户密码

```

docker run --name hexo \
-v /tmp/hexo:/app/hexo \
-p 8081:8081 \
-e HOST=#{Your domain} \
-e GITREPO=#{Your git repo} \
-e GIT_USERNAME=#{Your git username} \
-e GIT_PASSWD=#{Your git password} \
-d nginx-hexo
```
docker compose用法参考项目内示例的`compose.yml`：
```yml
name: < project name >
services:
    nginx-hexo:
        container_name: hexo
        volumes:
            - ~/hexo:/app/hexo
            # - /tmp/hexo-logs://var/log/nginx
        ports:
            - 8081:8081
        environment:
            - HOST=xj9264.xyz
            - GITREPO=https://git.xj9264.xyz/myproj/hexo.git
            - GIT_USERNAME=test1234
            - GIT_PASSWD=test1234
        image: nginx-hexo
```
