const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]), port=+process.argv[3];
const types={'.js':'application/javascript','.html':'text/html','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.css':'text/css'};
http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));
if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');
res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(port);
