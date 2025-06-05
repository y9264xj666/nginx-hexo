var url = require("url")
var http = require('http')
const { exec } = require("child_process")

function onRequest(request,response){
		route(request,response);
}

function route(request,response){
	pathname = url.parse(request.url).pathname;
 	if (typeof router_handler[pathname] === "function"){
 		router_handler[pathname](request,response);
	}else{
		response.write("<html>\
<head><title>404 Not Found</title></head>\
<body>\
<center><h1>404 Not Found</h1></center>\
<hr><center>nginx</center>\
</body>\
</html>");
	}
	response.end();
}

var router_handler = {}
router_handler["/"] = function(request,response){
	response.write("hello");
}

router_handler['/webhook'] = function(request,response) {
	let event = request.headers["x-github-event"];
	let data = {status: "unvalid webhook"};
	if (event == "push") {
		request.on('data',(chunk) => {
			let payload =  JSON.parse(chunk);
			exec(`cd /app/hexo && git pull origin master && hexo g`,(err,stdout,stderr) => {
				if (err) {
					console.error(`exec error: ${err}`);
				    return;
				 }
				console.log(`stdout: ${stdout}`);
				console.log(`stderr: ${stderr}`);
			});
			data = {status: payload.head_commit.id};
			console.log(`commit id is ${payload.head_commit.id}`)
		});
	}
	response.setHeader('Content-Type', 'application/json')
	response.write(JSON.stringify(data));	
}
router_handler['/test'] = function(request,response) {
	exec(`cd /app/hexo && git pull origin master && hexo g`,(err,stdout,stderr) => {
		if (err) {
			console.error(`exec error: ${err}`);
			return;
			}
		console.log(`stdout: ${stdout}`);
		console.log(`stderr: ${stderr}`);
	});
	response.setHeader('Content-Type', 'application/json')
	response.write('{status: "test..."}');	
}


http.createServer(onRequest).listen(5000);
console.log("server listent at %d",5000);
