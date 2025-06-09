#!/bin/sh
set -x

pm2 start webhook.js --name webhook

git config --global credential.helper store
git config --global --add safe.directory /app/hexo
if [ $GIT_USERNAME ] && [ $GIT_PASSWD ]; then
	daemon_name=`echo $GITREPO|awk -F'[/:]' '{print $4}'`
	http_s=`echo $GITREPO|awk -F':' '{print $1}'`
	echo "$http_s://$GIT_USERNAME:$GIT_PASSWD@$daemon_name" > ~/.git-credentials
fi

[ ! -f "/app/hexo/package.json" ] && git clone $GITREPO /app/hexo/

cd /app/hexo
npm install 
hexo g
nginx -g 'daemon off;'