import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, build, buildOptions } from './build.mjs';

export const PUBLIC_ROOT_FILES = ['.gitignore', 'README.md', 'AGENTS.md', 'LICENSE', 'package.json', 'mylife.config.json', 'demo.html'];
export const PUBLIC_DIRS = ['src', 'scripts', 'docs', 'templates', 'tests', 'examples/demo'];
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.html', '.json']);

export function publicFiles(root = ROOT) {
  const result = [];
  function add(relative) {
    const full = path.join(root, relative), stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`公开文件不能是符号链接：${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) {
        if (name === '.DS_Store' || name.startsWith('._')) continue;
        if (name.startsWith('.') || name === 'node_modules') throw new Error(`公开目录包含本地文件：${relative}/${name}`);
        add(relative + '/' + name);
      }
    } else if (stat.isFile()) {
      if (!PUBLIC_ROOT_FILES.includes(relative) && !TEXT_EXTENSIONS.has(path.extname(relative))) throw new Error(`公开清单中不支持的文件：${relative}`);
      result.push(relative);
    } else throw new Error(`不支持的公开文件类型：${relative}`);
  }
  for (const file of PUBLIC_ROOT_FILES) add(file);
  for (const dir of PUBLIC_DIRS) add(dir);
  return result.sort();
}

export function scanPublicText(text) {
  const issues = [];
  if (/(?:\/(?:Users|home)\/[^\s/'"<>]+\/|[A-Za-z]:\\Users\\[^\s\\'"<>]+\\)/.test(text)) issues.push('本机用户目录的绝对路径');
  if (/\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}\b/.test(text)) issues.push('疑似访问令牌');
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text)) issues.push('私钥');
  if (/(?:[?&](?:access_token|api_key|auth_token)=)[^\s&'"<>]{8,}/i.test(text)) issues.push('带凭据的 URL');
  return issues;
}

export function checkRelease(root = ROOT) {
  const files = publicFiles(root), issues = [];
  for (const file of files) for (const issue of scanPublicText(fs.readFileSync(path.join(root, file), 'utf8'))) issues.push(`${file}: ${issue}`);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'mylife.config.json'), 'utf8'));
  if (config.vaultDir !== 'examples/demo' || config.outputFile !== 'dist/index.html') issues.push('公开默认配置必须使用虚构示例和 dist/index.html');
  const result = build({ ...buildOptions(['--demo'], root), check: true }, root);
  if (result.html !== fs.readFileSync(path.join(root, 'demo.html'), 'utf8')) issues.push('demo.html 与当前虚构示例构建不一致，请重新执行 --demo');
  if (!result.data.isDemo || result.data.notes.some(note => !note.fictional)) issues.push('演示资料的虚构标记不完整');
  if (issues.length) throw new Error(issues.join('\n'));
  return { publicFiles: files.length, fictionalNotes: result.data.notes.length, graphNodes: result.data.nodeIds.length, issues: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(checkRelease(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
