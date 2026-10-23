# mylife-core

用 Markdown 持续记录个人经历、想法、选择和状态，通过可旋转的球形图谱浏览它们。

**仓库内的演示人物、日期、经历和项目全部虚构。** 公开内容只有通用程序、整理规则、模板和演示资料。

## 直接看演示

打开根目录的 [demo.html](demo.html)。它已经包含虚构示例，可离线浏览。

浏览器不支持直接打开本地 HTML 时，用 Node.js 启动本地预览：

```sh
node scripts/build.mjs --demo
node scripts/serve.mjs --demo
```

打开终端打印的地址。拖动旋转、滚轮或按钮缩放、点击节点阅读；方向键旋转，空格切换自动旋转，0 键复位。系统开启减少动态效果时默认不自动旋转。

## 环境与运行

需要 Node.js 22 或更高版本，无需安装第三方依赖。

```sh
node scripts/build.mjs
node scripts/serve.mjs
node --test
node scripts/check-release.mjs
```

也可以使用 package.json 中对应的 npm 脚本。普通构建读取 mylife.config.json，默认从 examples/demo 生成 dist/index.html；演示构建固定读取 examples/demo 并生成 demo.html。默认预览仅监听本机回环地址，只提供一个生成页面。

## 组织方式

六个主领域：个人背景、想法与偏好、生活与关系、学习与成长、项目与实践、阅读与创作。每篇内容只有一个主领域，同一对象持续合并到同一篇正文，跨领域通过双链关联。

当前状态只写最近有效的情况，时间线记录重要变化；一次询问不直接成为长期偏好，后续更正保持原有适用范围。知识讲解、公式、教程与题目答案放在单独的学习资料中。

完整方法见 [整理规则](docs/organization-rules.md)，文件格式见 [笔记格式](docs/note-format.md)。

## 使用自己的资料

1. 在仓库中创建 vault/，放入自己明确愿意记录的 Markdown；从 templates/ 复制空白模板并填写。
2. 新建 mylife.local.json，设置笔记目录、输出文件和中心节点。
3. 显式使用这份本地配置构建、预览。

```json
{
  "vaultDir": "vault",
  "outputFile": "dist/private.html",
  "profileId": "人物/我",
  "title": "我的人生档案",
  "description": "记录自己的经历与变化。"
}
```

```sh
node scripts/build.mjs --config mylife.local.json
node scripts/serve.mjs --config mylife.local.json
```

profileId 是笔记目录内的路径，不带 .md。省略时优先选人物节点，再选第一个节点。程序只读取指定的笔记目录，不遍历相邻项目、历史对话或账号。

vault/、dist/、本地配置和 QA 目录默认不进入 Git。**真实档案生成的 HTML 含笔记全文，包括隐藏的阅读页，应作为私人资料保管。** 隐藏节点不等于移除正文。发布说明见 [公开与私有资料边界](docs/privacy.md)。

## AI 整理与定时运行

AI 整理由使用者接入的外部工具执行，数据访问与调度由使用者配置。核心程序负责已有 Markdown 的校验、生成和浏览。[定时整理说明](docs/automation.md) 提供通用提示词，不含账号、密钥、聊天编号或特定机器配置。

## 目录

- src/：球形图谱界面模板。
- scripts/：构建、预览与公开文件检查工具。
- docs/：分类、时间有效性、文件格式与整理流程。
- templates/：空白人物、对象和经历模板。
- examples/demo/：全部虚构的演示档案。
- tests/：构建边界与预览服务的定向测试。
- demo.html：仅由虚构示例生成的独立演示页面。

## 许可证

代码与仓库文档采用 [MIT License](LICENSE)。[标准许可证说明](https://opensource.org/license/mit)。使用者自行提供的档案数据由其自行管理，不因使用本工具而自动公开或改变归属。
