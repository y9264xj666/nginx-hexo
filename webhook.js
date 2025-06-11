const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.WEBHOOK_PORT || 9000;
const HEXO_DIR = process.env.HEXO_DIR || '/app/hexo';
const GIT_REPO = process.env.GIT_REPO;
const GIT_USER = process.env.GIT_USER;
const GIT_PASSWORD = process.env.GIT_PASSWORD;

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
				// 验证事件类型（这里以GitHub为例）
				const isPushEvent = req.headers['x-github-event'] == 'push';
				if (isPushEvent)
				{	
					console.log('Processing push event');
					handleWebhook(payload, res);
				}
				else
				{
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ignored', event: 'non-push' }));
				}
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
	// 构建认证URL（如果提供了用户名和密码）
	let authRepoUrl = GIT_REPO;
	if (GIT_USER && GIT_PASSWORD) {
		// 提取协议和路径
		const repoProtocol = GIT_REPO.split('//')[0];
		const repoPath = GIT_REPO.split('//')[1];
		authRepoUrl = `${repoProtocol}//${GIT_USER}:${GIT_PASSWORD}@${repoPath}`;
	}
	
	const commands = [
		`cd ${HEXO_DIR}`,
		// 设置Git凭据
		`git config --global credential.helper 'store --file /tmp/git-credentials'`,
		`echo "${authRepoUrl}" > /tmp/git-credentials`,
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
}

server.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
    console.log(`HEXO_DIR: ${HEXO_DIR}`);
    console.log(`GIT_REPO: ${GIT_REPO || 'Not set'}`);
    // 不打印密码到日志
    console.log(`Using Git authentication: ${GIT_USER ? 'Yes' : 'No'}`);
});


/*
// 上述权限不足，提出的使用sh脚本替换执行的候补方法
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.WEBHOOK_PORT || 9000;
const HEXO_DIR = process.env.HEXO_DIR || '/app/hexo';
const GIT_REPO = process.env.GIT_REPO;
const GIT_USER = process.env.GIT_USER;
const GIT_PASSWORD = process.env.GIT_PASSWORD;

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
                handleWebhook(req, payload, res); // 添加 req 参数
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

function handleWebhook(req, payload, res) { // 添加 req 参数
    // 验证事件类型（GitHub push event）
    const isPushEvent = req.headers['x-github-event'] === 'push';
    
    if (isPushEvent) {
        console.log('Processing push event');
        
        // 1. 创建临时脚本文件
        const scriptPath = path.join('/tmp', `webhook-script-${Date.now()}.sh`);
        let scriptContent = `#!/bin/sh\n`;
        
        // 2. 构建认证URL（如果提供了用户名和密码）
        let authRepoUrl = GIT_REPO;
        if (GIT_USER && GIT_PASSWORD) {
            // 安全地处理特殊字符
            const encodedUser = encodeURIComponent(GIT_USER);
            const encodedPassword = encodeURIComponent(GIT_PASSWORD);
            const repoProtocol = GIT_REPO.split('//')[0];
            const repoPath = GIT_REPO.split('//')[1];
            authRepoUrl = `${repoProtocol}//${encodedUser}:${encodedPassword}@${repoPath}`;
        }
        
        // 3. 构建脚本内容
        scriptContent += `
echo "Setting up Git credentials..."
cd ${HEXO_DIR}
git config --global credential.helper 'store --file /tmp/git-credentials'
echo "${authRepoUrl}" > /tmp/git-credentials

echo "Pulling latest changes..."
git pull

echo "Installing dependencies..."
npm install

echo "Generating static files..."
hexo clean
hexo generate

echo "Done!"
`;
        
        // 4. 写入脚本文件
        fs.writeFileSync(scriptPath, scriptContent);
        fs.chmodSync(scriptPath, 0o755); // 添加执行权限
        
        console.log(`Created script at ${scriptPath}`);
        
        // 5. 执行脚本
        const options = {
            env: {
                ...process.env,
                PATH: process.env.PATH,
                UID: process.env.UID || '10000',
                GID: process.env.GID || '10000',
                HOME: '/tmp' // 确保有可写的主目录
            },
            uid: parseInt(process.env.UID || '10000'),
            gid: parseInt(process.env.GID || '10000'),
            timeout: 300000 // 5分钟超时
        };
        
        exec(scriptPath, options, (error, stdout, stderr) => {
            // 清理临时脚本
            try {
                fs.unlinkSync(scriptPath);
            } catch (cleanupErr) {
                console.error('Error cleaning up script:', cleanupErr);
            }
            
            if (error) {
                console.error(`Error executing commands: ${error}`);
                console.error(`STDERR: ${stderr}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'error', 
                    error: error.message,
                    stderr: stderr || ''
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
    console.log(`Using Git authentication: ${GIT_USER ? 'Yes' : 'No'}`);
});

*/


