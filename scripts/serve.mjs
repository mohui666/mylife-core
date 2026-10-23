import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildOptions } from './build.mjs';

export function createPreviewServer(file) {
  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    if (pathname !== '/' && pathname !== '/index.html') { response.writeHead(404); response.end(); return; }
    try {
      const html = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : html);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('图谱尚未生成，请先运行构建命令。');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = buildOptions(process.argv.slice(2));
    const server = createPreviewServer(options.outputFile);
    server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + '/'));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
