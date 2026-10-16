const http = require("http");
const https = require("https");
const { URL } = require("url");

const TARGET = "https://akaya-ai--preview-v2-rz3kv23y.web.app";
const PORT = 4000;

http.createServer((req, res) => {
  const target = new URL(req.url, TARGET);
  const opts = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
  };
  const proxy = https.request(opts, (pRes) => {
    res.writeHead(pRes.statusCode, pRes.headers);
    pRes.pipe(res);
  });
  proxy.on("error", (e) => {
    res.writeHead(502);
    res.end("Proxy error: " + e.message);
  });
  req.pipe(proxy);
}).listen(PORT, () => console.log(`Proxy on http://localhost:${PORT}`));
