import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { ROOT, DOMAINS, build, buildOptions, createGraph, linkNotes, parseNote, readVault, renderGraph } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/serve.mjs';
import { publicFiles, scanPublicText } from '../scripts/check-release.mjs';

const metadata = '---\ntype: 记录\ndomain: 生活与关系\nupdated: 2030-04-17\ntags: []\n---\n\n';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mylife-core-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir, name, text) {
  const file = path.join(dir, name);fs.mkdirSync(path.dirname(file), { recursive: true });fs.writeFileSync(file, text);return file;
}

test('演示从独立目录生成，全部虚构且六个领域都有内容', () => {
  const { data, warnings, html } = build({ ...buildOptions(['--demo']), check: true });
  assert.equal(data.notes.length, 21);
  assert(data.notes.every(note => note.fictional));
  for (const domain of DOMAINS) assert(data.notes.some(note => note.domain === domain));
  assert(data.nodeIds.includes(data.profileId));assert.equal(warnings.length, 0);
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test('只读取指定笔记目录，单个未连接笔记也可显示', t => {
  const dir = fixture(t), vault = path.join(dir, 'vault');
  write(vault, '本人.md', metadata + '# 示例节点\n');
  write(dir, 'outside.md', metadata + '# outside-vault-sentinel\n');
  const { data, warnings } = createGraph({ vaultDir: vault });
  assert.equal(data.notes.length, 1);assert.equal(data.edges.length, 0);assert.equal(warnings.length, 1);
  assert(!JSON.stringify(data).includes('outside-vault-sentinel'));
});

test('无效、重复的元数据给出具体错误', () => {
  assert.throws(() => parseNote('# 未填写', 'x.md'), /缺少笔记元数据/);
  assert.throws(() => parseNote(metadata.replace('生活与关系', '未分类'), 'x.md'), /domain/);
  assert.throws(() => parseNote(metadata.replace('type: 记录', 'type: 未知'), 'x.md'), /type/);
  assert.throws(() => parseNote(metadata.replace('2030-04-17', '2030-02-31'), 'x.md'), /updated/);
  assert.throws(() => parseNote(metadata.replace('tags: []', 'tags: [1]'), 'x.md'), /tags/);
  assert.throws(() => parseNote(metadata.replace('domain:', 'domain: 生活与关系\ndomain:'), 'x.md'), /重复字段/);
});

test('双链支持别名和标题片段，代码示例不参与校验', () => {
  const notes = [parseNote(metadata + '# 起点\n[[目标#一节|别名]]\n`[[不存在]]`\n\n```text\n[[也不存在]]\n```\n', '起点.md'), parseNote(metadata + '# 目标\n[[#本页]]\n', '目标.md')];
  linkNotes(notes);assert.deepEqual(notes[0].links, ['目标']);assert.deepEqual(notes[1].links, []);
});

test('不明确或不存在的双链阻止生成', () => {
  assert.throws(() => linkNotes([parseNote(metadata + '# x\n[[缺失]]', 'x.md')]), /无法解析双链/);
  const notes = [parseNote(metadata + '# x\n[[同名]]', 'x.md'), parseNote(metadata + '# 同名', 'a/同名.md'), parseNote(metadata + '# 同名', 'b/同名.md')];
  assert.throws(() => linkNotes(notes), /名称不唯一/);
});

test('构建失败不会覆盖已有输出', t => {
  const dir = fixture(t), vault = path.join(dir, 'vault'), output = write(dir, 'out.html', 'existing-output');
  write(vault, 'x.md', metadata + '# x\n[[缺失]]');
  assert.throws(() => build({ vaultDir: vault, outputFile: output }, ROOT), /无法解析双链/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing-output');
});

test('符号链接不会扩展笔记读取范围', t => {
  const dir = fixture(t), vault = path.join(dir, 'vault');
  write(vault, '本人.md', metadata + '# 本人');
  const outside = write(dir, 'other.md', metadata + '# 另一个目录');
  try { fs.symlinkSync(outside, path.join(vault, 'link.md')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('当前系统不允许创建测试符号链接'); throw error; }
  assert.throws(() => readVault(vault), /符号链接/);
});

test('笔记中的脚本结束标签被编码为数据', () => {
  const html = renderGraph({ text: '</script><script>bad()</script>\u2028' }, '<script>const DATA = /*__MYLIFE_DATA__*/ null;</script>');
  assert(!html.includes('</script><script>bad'));assert(html.includes('\\u003c'));assert(html.includes('\\u2028'));
});

test('演示构建不接受私人配置替换，私人输出不能覆盖演示', t => {
  assert.throws(() => buildOptions(['--demo', '--config', 'mylife.local.json']), /不能与其他配置/);
  const dir = fixture(t);
  write(dir, 'bad.json', JSON.stringify({ vaultDir: 'vault', outputFile: 'demo.html' }));
  assert.throws(() => buildOptions(['--config', 'bad.json'], dir), /只能通过 --demo/);
  write(dir, 'bad.json', JSON.stringify({ vaultDir: '.', outputFile: 'dist/index.html' }));
  assert.throws(() => buildOptions(['--config', 'bad.json'], dir), /仓库根目录/);
  write(dir, 'bad.json', JSON.stringify({ vaultDir: 'vault', outputFile: 'vault/out.html' }));
  assert.throws(() => buildOptions(['--config', 'bad.json'], dir), /笔记目录之外/);
});

test('演示资料必须明确标记为虚构', t => {
  const dir = fixture(t);write(dir, 'note.md', metadata + '# 示例');
  assert.throws(() => createGraph({ vaultDir: dir, isDemo: true }), /fictional/);
});

test('公开清单排除私有目录，扫描器可识别常见凭据和本机路径', () => {
  const files = publicFiles();
  assert(files.every(file => !/^(?:vault|dist|\.qa|\.release)\//.test(file)));
  assert(!files.some(file => file.endsWith('mylife.local.json')));
  assert(scanPublicText(['', 'Users', 'example', 'vault'].join('/')).includes('本机用户目录的绝对路径'));
  assert(scanPublicText('ghp_' + 'a'.repeat(30)).includes('疑似访问令牌'));
  assert.equal(scanPublicText('只有通用方法与虚构资料。').length, 0);
});

test('预览只提供一个页面，拒绝其他路径和写操作', async t => {
  const dir = fixture(t), file = write(dir, 'index.html', '<h1>虚构演示</h1>'), server = createPreviewServer(file);
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base)).status, 200);
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
  assert.equal((await fetch(base + '/README.md')).status, 404);
  assert.equal((await fetch(base + '/vault/private.md')).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
