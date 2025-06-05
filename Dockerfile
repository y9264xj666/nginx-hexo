FROM alpine
LABEL maintainer="Gary"


RUN apk add --no-cache nginx git ca-certificates nodejs npm jq 	curl 
RUN	rm -f /etc/nginx/conf.d/default.conf
RUN mkdir -p /run/nginx
# RUN myip=$(curl -s ifconfig.me);  \
# 	country_code=$(curl -s http://freegeoip.net/json/${myip}|jq .country_code); \
# 	echo "myip ${myip}_${country_code}"; \
# 	if [ "${country_code}" = "CN" ]; then \
# 		npm config set registry https://registry.npmmirror.com; \
# 	fi;
RUN npm config set registry https://registry.npmmirror.com
RUN npm install -g hexo-cli pm2
RUN git config --global credential.helper store

COPY webhook.js /app/
COPY entrypoint.sh /
COPY hexo.conf /etc/nginx/http.d/
WORKDIR /app
ENTRYPOINT ["/entrypoint.sh"]
EXPOSE 8000
