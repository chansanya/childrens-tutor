# 小问号学伴

面向 6–12 岁儿童的 AI 聊天演示站。孩子可以自由提问，回答简短易懂；**作业和创作只引导、不代写**，这是服务端强制执行的规则，前端无法绕过。

- 支持两种协议：OpenAI Responses、Anthropic Messages，均可自定义地址（Chat Completions 已弃用）
- 孩子想画画时自动识别并调用 ComfyUI 出图，支持多个工作流模板切换
- 每次对话记录各阶段耗时，控制台可查看 P50/P95 与处理路径
- 对话模型与审查模型可分属不同厂商，各自独立配置 Key 与地址
- 孩子只能在预设角色间选择，不能切换模型
- 支持新建、删除会话，重新回答，停止生成；会话保存在浏览器本地
- `/admin` 控制页：在线修改对话模型、审查模型、守护规则和角色，保存即生效
- 一条命令打包，用 Docker 部署到 Linux 服务器

文档：
- [docs/对话流程.md](docs/对话流程.md)：一次对话从发起、意图审查、画画到输出审查的完整过程，附代码行号
- [docs/目录说明.md](docs/目录说明.md)：每个目录和文件的作用

## 快速开始

需要 Node.js 20 及以上。

```bash
npm install
cp .env.example .env      # 填写模型配置，见下文
npm run dev               # http://localhost:3000
```

生产运行：

```bash
npm run build
npm start                 # 默认端口 3000，可用 PORT 指定
```

首次打开页面时，开发模式需要编译并下载字体，可能要等十几秒，之后会快很多。

## 配置

模型配置可以写在 `.env` 里，也可以全部留空，启动后到 `/admin` 填写。两者同时存在时，以控制页保存的为准。没有配好对话模型和审查模型之前，孩子端会提示"学伴还没准备好"。

### 对话模型

| 变量 | 必填 | 说明 |
|---|---|---|
| `PROVIDER` | 填了就需要配齐下面的必填项 | `openai-responses`（Responses API）或 `anthropic`（Messages）。旧值 `openai`（Chat Completions）已弃用，会被当作未配置并在日志中提示 |
| `API_KEY` | 是 | 厂商 API Key |
| `BASE_URL` | 否 | 留空使用官方地址；OpenAI 兼容服务通常要带 `/v1` |
| `MODEL` | 是 | 模型名 |
| `EXTRA_BODY` | 否 | 原样合并进请求体的厂商私有参数（JSON 对象） |

### 审查模型

审查模型负责"意图审查"和"输出审查"，**必须选快速、非推理的模型**：它只允许输出一个单词，推理模型来不及给出结论。

| 变量 | 说明 |
|---|---|
| `GUARD_MODEL` | 审查用的模型，留空则与 `MODEL` 相同 |
| `GUARD_PROVIDER` / `GUARD_API_KEY` / `GUARD_BASE_URL` | 审查模型属于另一家厂商时填写 |
| `GUARD_EXTRA_BODY` | 厂商私有参数。混合思考模型必须用它关闭思考，例如阿里云：`{"enable_thinking": false}` |
| `GUARD_STRICT` | 严格模式，默认 `true`：输出审查调用失败或结果无法解析时不放行；设为 `false` 则放行 |

继承规则：

- 只填 `GUARD_MODEL` 时，审查沿用对话模型的协议、Key 和地址。
- `GUARD_PROVIDER`、`GUARD_API_KEY`、`GUARD_BASE_URL` 中**任意一项**有值，审查就使用完全独立的连接。此时 `GUARD_PROVIDER`、`GUARD_API_KEY`、`GUARD_MODEL` 必填，地址不会沿用对话模型的值，避免拿一家的 Key 去请求另一家的地址。

示例：对话用 OpenAI 兼容代理，审查用阿里云百炼。

```bash
PROVIDER=openai-responses
API_KEY=sk-xxx
BASE_URL=https://your-proxy.example.com/v1
MODEL=your-chat-model

GUARD_PROVIDER=openai-responses
GUARD_API_KEY=sk-yyy
GUARD_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
GUARD_MODEL=qwen-turbo
GUARD_EXTRA_BODY={"enable_thinking": false}
GUARD_STRICT=true
```

修改 `.env` 后需要重启服务。

### 角色

角色定义在 [config/roles.json](config/roles.json)：

```json
{
  "id": "explorer",
  "name": "好奇博士",
  "tagline": "天空、恐龙、宇宙，什么都能问",
  "icon": "telescope",
  "color": "#ff7a45",
  "greeting": "你好呀，小探险家！今天想知道什么秘密？",
  "persona": "你是“好奇博士”……",
  "model": "可选，为该角色单独指定对话模型"
}
```

- `persona` 和 `model` 只在服务端使用，不会下发到前端。
- `icon` 可选值：`bot` `book-open` `brain` `calculator` `cat` `dog` `flask-conical` `globe` `heart` `leaf` `lightbulb` `palette` `puzzle` `rocket` `sparkles` `star` `telescope`。填了不认识的名字会显示 `sparkles`。

## 控制页

访问 `/admin`，或点击儿童端侧边栏右上角的设置图标进入。控制台采用左侧菜单、右侧单模块的后台布局（移动端菜单为顶部横向标签）：

| 菜单 | 内容 |
|---|---|
| 模型配置 | 对话模型和审查模型：沿用 `.env` 配置，或自定义协议、地址、Key、模型、额外参数；可一键加载服务商的模型列表并筛选选择 |
| 守护规则 | 编辑所有角色系统提示词最前面的硬规则 |
| 角色管理 | 新增、编辑、删除角色：名称、简介、图标、主题色、问候语、人设提示词、专属模型 |
| 绘画 | 启用开关、ComfyUI 地址与测试连接、超时和排队上限；管理绘画模板并切换正在使用的模板 |
| 审计 | 近 1 / 7 / 30 天各阶段耗时的 P50、P95、均值，处理路径占比，最近 100 条记录 |

菜单项上的琥珀色圆点表示"尚未配置"，主题色圆点表示"有未保存的修改"。保存按钮统一在底部，保存后立即生效，无需重启。守护规则、角色管理和绘画模板都有"恢复默认"。

- 修改内容保存在 `config/settings.json` 中，优先级高于 `.env` 和 `roles.json`。该文件可能包含 API Key，已加入 `.gitignore`。
- 角色一旦在控制台保存过，就以 `settings.json` 中的完整列表为准；"恢复默认"会回到 `roles.json`。至少保留一个角色，最多 20 个，删除需要二次确认。孩子端引用了已删除角色的会话会回到首页。
- 页面上只显示 Key 的尾号。修改协议或地址时必须重新填写 Key，已保存的 Key 不会被发往新地址。
- 控制页**没有登录保护**，仅适合演示环境。部署到公网前请自行加上访问控制。

## 绘画

孩子说"帮我画一只在月亮上钓鱼的小猫"这类话时，意图审查会判为 `draw`。它和文字生成本来就同时进行，所以识别画画意图不会多调一次模型。交作业用的画（手抄报、美术作业等）不算画画请求，会按作业引导处理，只给构图和配色思路，不出图。

```
意图判为 draw → 中止文字生成
  ① ComfyUI 排队数 ≥ 上限 → "小画家正忙"
  ② 审查模型把孩子的话改写成提示词（语言跟随模板），并生成一句给孩子的回复
  ③ 审查模型复核提示词是否适合儿童
  ④ 按当前模板填入提示词、随机种子 → POST /prompt → 轮询 /history，同时向前端推送排队位置与渲染状态
  ⑤ 下载图片到 data/images/，通过 /api/images/<文件名> 提供给前端
```

- 内置两个模板：**Z-Image Turbo**（中文提示词，8 步，默认使用）和 **H3 高清**（英文提示词，50 步，`megapixels` 已调为 1）。
- 新增模板时，粘贴从 ComfyUI 导出的 **API 格式**工作流，点"自动识别节点"，再确认提示词节点和种子节点是否正确：工作流里有正、负两个文本节点时，自动识别可能会选到负向提示词那个。
- 孩子中途停止或超时：排队中的任务会从 ComfyUI 队列删除；正在渲染且确认是自己的任务才会中断。
- `.env` 中的 `COMFY_URL` 只作为默认地址，填写后默认启用绘画。
- 生成的图片不会自动清理，请留意 `data/images/` 的磁盘占用。

## 审计

每次对话结束时输出一行 JSON：一份打印到服务日志（前缀 `[audit] `），一份追加到 `data/logs/audit-YYYY-MM.jsonl`。重新部署时容器会重建，`docker logs` 会丢失，所以分析请以 jsonl 文件为准。记录**不包含对话原文**：

```json
{"ts":"2026-10-23T10:00:00.000Z","id":"…","role":"explorer","mainModel":"kimi-k3","guardModel":"deepseek-v4.1-flash","inChars":12,"guide":false,
 "intent":"normal","verdict":"pass","outChars":86,"path":"answer","ms":{"generate":3400,"intent":620,"review":540,"total":4010}}
```

- 控制台"审计"页可以一键清除全部日志，需要二次确认，删除后不可恢复。
- `ms` 中各阶段独立计时。意图审查和生成同时进行，所以各阶段之和会大于 `total`；被中止的生成不计时。
- 阶段：`intent` `generate` `review` `rewrite` `review2`；画画另有 `drawPrompt` `drawReview` `drawQueue` `drawRender` `drawFetch`。
- 路径 `path`：`answer` `rewrite` `fallback` `refusal` `injection` `unsafe_intent` `unsafe_output` `guard_error` `draw` `draw_busy` `draw_failed` `draw_unsafe` `error` `aborted`。

命令行统计示例：

```bash
# 总耗时 P95
jq -s 'map(.ms.total) | sort | .[length * 95 / 100 | floor]' data/logs/audit-*.jsonl
# 各路径次数
jq -s 'group_by(.path) | map({path: .[0].path, n: length})' data/logs/audit-*.jsonl
```

## 部署

目标服务器只需要 Docker 和 Docker Compose，不需要安装 Node.js。本地在 Windows 上打包，产物是自带运行依赖的 standalone 构建；服务器上不执行 `npm install`。

```powershell
npm run deploy                                                  # 构建并打包为 release/childrens-tutor.tgz
powershell -File scripts/deploy.ps1 -Server root@your-server   # 打包后通过 scp/ssh 直接发布（需要免密登录）
```

不方便用 ssh 时，可以手动把 `release/childrens-tutor.tgz` 上传到服务器的 `/tmp`，然后执行：

```bash
mkdir -p /opt/childrens-tutor
tar --no-same-permissions -xzf /tmp/childrens-tutor.tgz -C /opt/childrens-tutor ./remote.sh
bash /opt/childrens-tutor/remote.sh /tmp/childrens-tutor.tgz
```

`remote.sh` 会解压发布包、构建运行镜像（`node:20-alpine`）、用 `docker compose` 启动容器 `childrens-tutor`，并做健康检查。容器设置了 `restart: unless-stopped`，服务器重启后会自动拉起。

服务器上的目录结构：

```
/opt/childrens-tutor/
  app/                  应用代码，每次部署整体替换
  data/                 挂载到容器的 /data，重新部署不会丢失
    config/             roles.json 与控制页保存的 settings.json
    logs/               审计日志 audit-YYYY-MM.jsonl
    images/             画画生成的图片
  .env                  首次部署时生成的空文件（权限 600），可写入模型配置
  Dockerfile  docker-compose.yml  remote.sh
```

- 默认端口 3000，可以在执行 `remote.sh` 前设置 `HOST_PORT` 修改；安装目录可以用 `APP_DIR` 修改。
- 打包时会剔除 `.env*` 和 `config/`，Key 不会进入发布包。服务器上的配置来自它自己的 `.env` 和 `data/config/`。
- 部署构建输出到 `.next-release`，不会影响本地正在运行的 `npm run dev`。
- 容器里通过 `DATA_DIR=/data`、`CONFIG_DIR=/data/config` 指定目录；本地运行不设置时，配置读取项目下的 `config/`，日志和图片写入项目下的 `data/`。
- 测试服务器要能访问 ComfyUI 地址，"测试连接"是从服务器发起的请求。

## 安全机制

服务端采用**先审后放**：只有通过输出审查的内容和预置的固定话术会下发给前端，审查结束前孩子看不到任何生成内容。

```
孩子提问
  │
  ① 请求清洗：只保留孩子和学伴的消息；单条最多 500 字，最多保留最近 20 条
  ② 关键词拦截注入话术（如“忽略规则”“开发者模式”）→ 友好拒绝
  ③ 意图审查 ∥ 主模型生成（同时进行）
       ├─ 试图绕过规则 → 中止生成 → 友好拒绝，并引导孩子自己思考
       ├─ 不安全话题   → 中止生成 → 安全提示话术
       └─ 想画画       → 中止生成 → 改写提示词 → 提示词复核 → ComfyUI 出图
  ④ 输出审查
       ├─ 通过     → 下发回答
       ├─ 代写     → 按严格引导模式重新生成 → 再次审查 → 下发，不通过则用固定引导话术
       ├─ 不安全   → 安全提示话术
       └─ 审查故障 → 严格模式下提示稍后再试
```

提示词层面的加固：

- 硬规则中列出了常见的绕过方式，并附有示范对话
- 每轮在孩子的最新消息前附加一条守则提醒
- 孩子的请求命中作业类关键词时，额外启用引导模式

审查模型的调用细节：

- 每次调用最多输出 10 个 token（Responses 协议的下限是 16），超时时间为 6 秒
- 意图审查查看最近 5 条消息，出错时放行，因为后面还有输出审查
- 输出审查查看最近 3 条消息加待审回答，出错时按 `GUARD_STRICT` 处理
- 走 Responses 协议时，请求会带上 `store: false`，不在厂商侧留存对话

每一步的详细说明和对应代码行，见 [docs/对话流程.md](docs/对话流程.md)。

## 项目结构

```
config/              角色定义；控制台保存的 settings.json（含 Key，不提交）
deploy/              Dockerfile、docker-compose.yml、服务器端部署脚本
docs/                对话流程、目录说明
scripts/             本地打包与发布脚本
src/app/             页面与接口（api/chat 为对话主流程）
src/lib/server/      服务端核心：配置、模型调用、guard/（引导与审查）、draw/（画画）、审计
src/components/      界面组件
```

每个文件的作用见 [docs/目录说明.md](docs/目录说明.md)。

## 接口

`POST /api/chat`

```json
{ "roleId": "explorer", "messages": [{ "role": "user", "content": "为什么天空是蓝色的？" }] }
```

返回 SSE 事件流，最多包含两个事件：

| 事件 | 数据 | 说明 |
|---|---|---|
| `reviewing` | `{}` | 生成完成，开始输出审查 |
| `answer` | `{ "text": "...", "guided": true }` | 最终回答；`guided` 表示这是引导或拒绝话术 |
| `error` | `{ "message": "..." }` | 出错，`message` 是面向孩子的提示 |

客户端提交的 `model`、`system` 等字段一律忽略，模型和系统提示词只由服务端决定。

## 注意事项

- **速度**：孩子等待的时间约等于"主模型生成时间 + 一次审查"。带思考的主模型会明显变慢，追求速度请选非推理模型。
- **部署平台**：控制页的配置写入服务器本地文件。Vercel 这类文件不能持久保存的平台上，保存的配置会丢失，请按上文用 Docker 部署在可写磁盘的环境中。
- **合规**：本项目是演示。正式面向未成年人上线前，建议接入厂商内容安全服务，并按相关法规完成备案与合规评估。
