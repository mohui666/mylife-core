import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOMAINS = ['个人背景', '想法与偏好', '生活与关系', '学习与成长', '项目与实践', '阅读与创作', '档案入口'];
const TYPES = new Set(['人物', '偏好', '课程', '项目', '作品', '记录', '状态', '索引', '规则']);
const SKIP = new Set(['node_modules', '原件', '缓存', '导出', '模板', 'templates']);

function fail(message) { throw new Error(message); }

export function parseNote(text, file) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) fail(`${file}: 缺少笔记元数据`);
  const fields = Object.create(null);
  for (const line of front[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z]+):\s*(.*?)\s*$/);
    if (!match) fail(`${file}: 不支持的元数据格式`);
    if (Object.hasOwn(fields, match[1])) fail(`${file}: 重复字段 ${match[1]}`);
    fields[match[1]] = match[2];
  }
  if (!DOMAINS.includes(fields.domain)) fail(`${file}: 无效的主领域 domain`);
  if (!TYPES.has(fields.type)) fail(`${file}: 无效的对象类型 type`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updated || '') || Number.isNaN(Date.parse(fields.updated + 'T00:00:00Z')) || new Date(fields.updated + 'T00:00:00Z').toISOString().slice(0, 10) !== fields.updated) fail(`${file}: updated 必须是有效的 YYYY-MM-DD 日期`);
  let tags;
  try { tags = JSON.parse(fields.tags || '[]'); } catch { fail(`${file}: tags 必须是 JSON 字符串数组`); }
  if (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string')) fail(`${file}: tags 必须是 JSON 字符串数组`);
  const body = text.slice(front[0].length).trim();
  const id = file.replace(/\.md$/i, '');
  return { id, file, title: body.match(/^#\s+(.+)$/m)?.[1] || path.posix.basename(id), type: fields.type, domain: fields.domain, updated: fields.updated, tags, fictional: fields.fictional === 'true', graph: fields.graph !== 'false' && fields.type !== '规则', text: body, links: [] };
}

export function readVault(vaultDir) {
  const files = [];
  function walk(directory) {
    if (fs.lstatSync(directory).isSymbolicLink()) fail('笔记目录不能是符号链接');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('笔记目录内不能包含符号链接');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'AGENTS.md') files.push(full);
    }
  }
  walk(vaultDir);
  if (!files.length) fail('指定目录内没有 Markdown 笔记');
  return files.sort().map(file => parseNote(fs.readFileSync(file, 'utf8'), path.relative(vaultDir, file).split(path.sep).join('/')));
}

export function linkNotes(notes) {
  const byId = new Map(notes.map(note => [note.id, note]));
  const names = new Map();
  for (const note of notes) {
    const name = path.posix.basename(note.id);
    names.set(name, [...(names.get(name) || []), note]);
  }
  const errors = [];
  for (const note of notes) {
    const searchable = note.text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '').replace(/`[^`]*`/g, '');
    note.links = [];
    for (const match of searchable.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const raw = match[1].split('|')[0], target = raw.split('#')[0].trim().replace(/\.md$/i, '');
      let other = target ? byId.get(target) : raw.includes('#') ? note : null;
      if (!other && target && !target.includes('/')) {
        const candidates = names.get(target) || [];
        if (candidates.length > 1) { errors.push(`${note.file}: 双链名称不唯一 ${target}，请使用从笔记目录开始的完整路径`); continue; }
        other = candidates[0];
      }
      if (!other) errors.push(`${note.file}: 无法解析双链 ${match[1]}`);
      else if (other.id !== note.id) note.links.push(other.id);
    }
    note.links = [...new Set(note.links)];
  }
  if (errors.length) fail(errors.join('\n'));
  return notes;
}

export function createGraph(options) {
  const notes = linkNotes(readVault(options.vaultDir));
  if (options.isDemo && notes.some(note => !note.fictional)) fail('演示笔记必须全部标记 fictional: true');
  const nodes = notes.filter(note => note.graph);
  if (!nodes.length) fail('没有可显示的图谱节点');
  const nodeIds = new Set(nodes.map(note => note.id));
  const profileId = options.profileId || nodes.find(note => note.type === '人物')?.id || nodes[0].id;
  if (!nodeIds.has(profileId)) fail('profileId 必须对应一个可显示的笔记节点');
  const keys = new Set(), edges = [];
  for (const note of nodes) for (const target of note.links) {
    if (!nodeIds.has(target)) continue;
    const key = [note.id, target].sort().join('\u0000');
    if (!keys.has(key)) { keys.add(key); edges.push({ source: note.id, target }); }
  }
  const connected = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  const warnings = nodes.filter(note => !connected.has(note.id)).map(note => `未连接节点：${note.file}`);
  const data = { title: options.title || 'mylife-core', description: options.description || '记录个人经历与变化。', profileId, isDemo: Boolean(options.isDemo), domains: DOMAINS, updated: notes.map(note => note.updated).sort().at(-1), notes, nodeIds: [...nodeIds], edges };
  return { data, warnings };
}

export function renderGraph(data, template) {
  const marker = '/*__MYLIFE_DATA__*/ null';
  if (template.split(marker).length !== 2) fail('界面模板必须恰好包含一个数据占位符');
  const encoded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return template.replace(marker, () => encoded);
}

export function buildOptions(argv = [], root = ROOT) {
  const demo = argv.includes('--demo'), check = argv.includes('--check');
  const rest = argv.filter(arg => arg !== '--demo' && arg !== '--check');
  if (demo && rest.length) fail('--demo 不能与其他配置参数组合');
  if (rest.length && (rest.length !== 2 || rest[0] !== '--config')) fail('用法：node scripts/build.mjs [--demo | --config 文件] [--check]');
  if (demo) return { vaultDir: path.join(root, 'examples/demo'), outputFile: path.join(root, 'demo.html'), profileId: '', title: 'mylife-core', description: '虚构示例 · 六领域个人档案', isDemo: true, check };
  const configFile = path.resolve(root, rest[1] || 'mylife.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (typeof config.vaultDir !== 'string' || typeof config.outputFile !== 'string') fail('配置需要 vaultDir 和 outputFile');
  const vaultDir = path.resolve(path.dirname(configFile), config.vaultDir);
  if (vaultDir === root) fail('vaultDir 不能是程序仓库根目录，请指定独立笔记目录');
  const outputFile = path.resolve(path.dirname(configFile), config.outputFile);
  if (path.extname(outputFile).toLowerCase() !== '.html') fail('outputFile 必须是 HTML 文件');
  const insideVault = path.relative(vaultDir, outputFile);
  if (!insideVault.startsWith('..' + path.sep) && insideVault !== '..' && !path.isAbsolute(insideVault)) fail('outputFile 必须保存在笔记目录之外');
  const demoFile = path.join(root, 'demo.html');
  if (outputFile === demoFile) fail('demo.html 只能通过 --demo 生成');
  if (outputFile === path.join(root, 'src/graph-template.html')) fail('outputFile 不能覆盖界面模板');
  return { ...config, vaultDir, outputFile, isDemo: vaultDir === path.join(root, 'examples/demo'), check };
}

export function build(options, root = ROOT) {
  const { data, warnings } = createGraph(options);
  const html = renderGraph(data, fs.readFileSync(path.join(root, 'src/graph-template.html'), 'utf8'));
  if (!options.check) {
    fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
    fs.writeFileSync(options.outputFile, html);
  }
  return { data, warnings, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = buildOptions(process.argv.slice(2));
    const { data, warnings } = build(options);
    for (const warning of warnings) console.warn(warning);
    console.log(JSON.stringify({ notes: data.notes.length, nodes: data.nodeIds.length, edges: data.edges.length, isDemo: data.isDemo, checkedOnly: options.check, output: path.relative(ROOT, options.outputFile) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
