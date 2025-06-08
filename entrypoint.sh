#!/bin/sh
set -x

#[ -z $HOST ] && HOST=$(hostname -i)
#sed -i "s/IP_OR_HOST/$HOST/" /etc/nginx/conf.d/hexo.conf
pm2 start webhook.js --name webhook

if [ $GIT_USERNAME ] && [ $GIT_PASSWD ]; then
	# str=$GITREPO
	daemon_name=`echo $GITREPO|awk -F'[/:]' '{print $4}'`
	http_s=`echo $GITREPO|awk -F':' '{print $1}'`
	echo "$http_s://$GIT_USERNAME:$GIT_PASSWD@$daemon_name" > ~/.git-credentials
fi

git config --global --add safe.directory /app/hexo


[ ! -f "/app/hexo/package.json" ] \
	&& git clone $GITREPO /app/hexo/

cd /app/hexo
npm install 
hexo g
nginx -g 'daemon off;'