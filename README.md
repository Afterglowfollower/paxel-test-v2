# Paxel Test Local

这是一个**独立的本地复现原型**，用于分析 Claude Code / Codex / Hermes / DeepSeek harness / opencode 会话、关联本地 Git 证据，并生成 HTML 报告。它不是 YC Paxel 官方客户端，也不保证与官方分数相同。

## 前置

- Node.js 18+
- **Python 3.9+**（必须有：`npx` 只是入口，实际分析由 `python3` 执行；未安装会直接失败）
- Git
- 可选：`zstandard`（读取 DeepSeek harness 的 `.zstd` 日志；`python3 -m pip install zstandard`）
- 模型评价使用火山方舟，需要 `ARK_API_KEY` 或 `--relay`；两者都没有时自动只生成本地证据报告，不需要任何密钥

## Key 放哪里（不暴露到 GitHub）

默认使用火山方舟，按优先级解析：

1. 环境变量 `ARK_API_KEY`
2. `--api-key-file /path/to/key`
3. 本地默认文件 `~/.config/paxel-test/ark_api_key`

推荐用隐藏输入保存到仓库外：

```bash
python3 tools/set-api-key.py
```

它会写入 `~/.config/paxel-test/ark_api_key`，权限 `600`，目录 `700`；工具会自动读取，不会把 key 写进报告、不会打印 key，也不在仓库里。

也可以指定路径：

```bash
python3 tools/set-api-key.py --path /你的/私有目录/ark.key
npx --yes github:Afterglowfollower/paxel-test --all-local --api-key-file /你的/私有目录/ark.key
```

不要把 key 写进 README、提交到 git、或贴到聊天/issue 里；`.env`、`.env.*`、`*.key` 已经在 `.gitignore` 中，但仍建议放在仓库外。

### 方舟模型

先在[火山方舟控制台](https://console.volcengine.com/ark/region:cn-beijing/apiKey?apikey=%7B%7D)取得 API Key，并确认要调用的模型已在对应项目中开通。默认模型 ID 为 `doubao-seed-2-1-pro-260915`；若账号未开通该模型，用 `--model` 指定可调用的模型 ID。

```bash
python3 tools/set-api-key.py
npx --yes github:Afterglowfollower/paxel-test --all-local
```

也可设置 `ARK_API_KEY` 环境变量或用 `--api-key-file /私有路径/key`。默认请求地址为北京区域的 `https://ark.cn-beijing.volces.com/api/v3/chat/completions`。GLM 支持已移除，`--provider` 只接受 `ark`。

## 使用方式

### 1. 全量：一条命令查全部

```bash
npx --yes github:Afterglowfollower/paxel-test --all-local
```

已配置 `ARK_API_KEY` 或传了 `--relay` 时会自动追加模型评价；两者都没有时自动只做本地分析，
不会报错。

范围：

- Claude Code（`~/.claude/projects`）
- Codex（`~/.codex/sessions`）
- Hermes（`~/.hermes/state.db`，SQLite 只读）
- DeepSeek harness（`$DSH_HOME/sessions`、`~/.dsh/sessions`、`~/dsh-home/sessions`）
- opencode（`~/.local/share/opencode/opencode*.db`，SQLite 只读）

`--all-local` 会按每个会话的 `cwd` 找到对应 Git 仓库，收集时间窗内的本地提交，并按仓库分组、关联片段。不在 Git 仓库里的会话（例如临时工作目录）不会产生提交证据。

默认输出到当前目录的 `paxel-report/report.html`。不带 `--all-local` 时，`npx` 入口默认只分析 Claude Code 最近 90 天；只想看本地覆盖、不调用模型时，在命令末尾加 `--no-score`。

### 2. 单项目

```bash
npx --yes github:Afterglowfollower/paxel-test --project /绝对路径/你的项目
```

只分析 `cwd` 在该仓库下的会话，加该仓库的本地 Git / PR ref / 导出的 diff。可和 `--sources` 组合：

```bash
npx --yes github:Afterglowfollower/paxel-test \
  --project /绝对路径/你的项目 --sources opencode
```

只看这个项目的 Codex 对话与 agent 调用轨迹，可先生成不调用模型的本地报告：

```bash
npx --yes github:Afterglowfollower/paxel-test \
  --project /绝对路径/你的项目 --sources codex --no-score
```

打开 `paxel-report/report.html`，点击“查看 Codex 会话与 agent 调用轨迹”；也可直接打开 `paxel-report/codex-trajectories.html`。页面按父子会话展示消息、工具调用和结果，并列出原始 JSONL 路径。页面中的事件已脱敏、截断；需要完整内容时在本机查看列出的日志文件。`--project` 以 Git 仓库为单位，指定仓库内子目录仍会分析整个仓库。

如果 PR diff 已经在本地导出，可加 `--pr-diff-dir /目录`（文件名为 `pr-42.diff`），或用 `--base-ref main` 读取本地 `refs/pull/N/head`。工具不会为了补 diff 自动联网。

`--project` 命中会话有两种方式：会话的工作目录在该项目下（含指定子目录时的整个 Git 仓库），
或者会话里的工具调用改动过该项目下的文件。后者用于"从父目录启动、后来才进入子项目"的情形，
命中数量会记在 `evidence.json` 的 `coverage.matched_by_touched_path` 里，单个会话的命中方式见
`sessions[].matched_by`。

### 3. 单来源（单个 harness）

```bash
# 只分析 Hermes
npx --yes github:Afterglowfollower/paxel-test --all-local --sources hermes

# 只分析 opencode
npx --yes github:Afterglowfollower/paxel-test --all-local --sources opencode

# 多选
npx --yes github:Afterglowfollower/paxel-test --all-local --sources claude,codex
```

可选来源：`claude`、`codex`、`hermes`、`deepseek`、`opencode`。

### 4. 常用参数

| 参数 | 作用 |
| --- | --- |
| `--all-local` | 五种来源 + 逐仓库 Git 提交 |
| `--project PATH` | 单个项目；读取该项目下的会话和本地 Git |
| `--sources LIST` | 逗号分隔的来源过滤，默认全部 |
| `--days N` | 最近 N 天，默认 90；`0` 表示不限时间范围 |
| `--output-dir PATH` | 报告目录；Node 入口默认 `./paxel-report`，Python 入口默认 `./paxel-reproduction` |
| `--score` / `--no-score` | 有 Key 或 `--relay` 时默认调用模型评价；`--no-score` 只做本地证据报告；两者都没有时自动降级为本地报告 |
| `--api-key-file PATH` | 从指定文件读取 key；默认 `~/.config/paxel-test/ark_api_key` |
| `--relay URL` | 走共享中转，不需要本地 key；令牌由 `PAXEL_RELAY_TOKEN` 或 `--relay-token` 提供 |
| `--request-timeout N` | 单次模型请求超时秒数，默认 240 |
| `--thinking MODE` | `auto` 或 `disabled`；默认 `disabled`，关闭推理 token。抽取类任务（叙事/分类）用 `disabled` 明显更快，评分口径如需更强推理可改回 `auto` |
| `--model NAME` | 模型 ID；方舟默认 `doubao-seed-2-1-pro-260915`，可改为已开通的模型 ID |
| `--concurrency N` | 模型调用并发数，默认 4；`1` 为串行 |
| `--max-parts N` | 跳过需要超过 N 段叙事的超大会话，默认 0（不限制） |
| `--prompt-profile local\|v15-v5` | prompt 基线，默认 `local` |
| `--claude-dir`、`--codex-dir`、`--hermes-db`、`--dsh-dir`、`--opencode-dir` | 指定各来源位置 |
| `--help` | 查看完整参数 |

也可以直接用 Python 入口：

```bash
python3 python/paxel_reproduction.py --all-local --days 90 --score --concurrency 4 \
  --output-dir /你的/私有输出目录
```

## 让别人也能跑（不暴露你的 Key）

两种方式都不需要把你的 key 交给别人。

### 方式一：无 key 本地模式（默认行为）

任何人拿到仓库直接跑，不传 `--score` 就不会有任何模型调用：

```bash
npx --yes github:Afterglowfollower/paxel-test --all-local
```

产物是完整的 `report.html` / `trajectory.html`，只缺五维评分的模型判断。想要模型评价的人自己准备 key 即可。

### 方式二：共享中转（用你的额度，但 key 不外泄）

`relay/server.js` 是一个零依赖转发服务：真实 key 只存在于该进程的环境变量里，调用方拿到的是**可吊销的共享令牌**，并且所有请求都受限额约束。

服务端：

```bash
RELAY_TOKEN='公开令牌1,公开令牌2' \
ARK_API_KEY='你的真实 key' \
RELAY_PORT=8787 \
node relay/server.js
```

生产环境请放在 HTTPS 反向代理后面（Nginx / Caddy / 云负载均衡），并只暴露这一个路径。

调用方：

```bash
PAXEL_RELAY_TOKEN='公开令牌1' \
npx --yes github:Afterglowfollower/paxel-test --all-local --relay https://relay.example.com
```

限额参数：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `RELAY_DAILY_REQUESTS` | 500 | 全局每日请求上限，到顶直接拒绝 |
| `RELAY_PER_IP_HOURLY` | 20 | 单 IP 每小时上限 |
| `RELAY_CONCURRENCY` | 4 | 同时进行中的上游调用数 |
| `RELAY_MAX_TOKENS` | 8192 | 强制夹紧 `max_tokens` |
| `RELAY_TIMEOUT_MS` | 600000 | 上游超时 |
| `RELAY_MODEL` | 空 | 强制所有调用使用指定模型 |
| `RELAY_UPSTREAM` | 方舟北京 | 上游地址，必须 https（loopback 例外） |
| `RELAY_MAX_BODY_BYTES` | 524288 | 请求体上限 |

`GET /healthz` 返回当日用量与并发占用，可用于探活。

**需要清楚的风险**：共享令牌是公开的，谁都能用；上限只能约束总额，不能阻止别人把它刷满。要止损就从 `RELAY_TOKEN` 里删掉对应令牌并重启。中转只代理 `POST /v1/chat/completions`，不接受调用方指定上游，`stream` 被强制关闭，调用方也无法自带 token 预算。

## 模型评价

默认使用火山方舟，需要 `ARK_API_KEY` 或本地方舟 key 文件。同一条命令会先提取会话叙事和工作片段证据，再基于全部已分析片段生成**一份针对人的综合评价**。报告层次包括：一句总体判断、构建者类型、AI 协作方式、做过什么、决策模式、优势、成长点、五维评价依据和判断边界。逐片段结果只留在 JSON 里供审计，不逐条呈现在报告页面。

```bash
export ARK_API_KEY='在你自己电脑上设置的新 Key'
npx --yes github:Afterglowfollower/paxel-test --all-local
```

没有 Key 时命令不会报错，而是自动只做本地证据分析并打印一行提示；只有**显式**加 `--score` 而没有可用的 Key 或 `--relay` 才会报错。可以运行 `python3 tools/set-api-key.py` 保存方舟 key，或加 `--no-score` 明确只做本地分析。`--score` 和 `--no-score` 不能同时使用。请勿把 Key 写入命令行参数、仓库或聊天记录。

## 报告什么时候出现

| 模式 | `report.html` 出现时机 | 内容 |
| --- | --- | --- |
| `--no-score` | 本地解析完立即写，通常几秒到几十秒 | 证据/覆盖报告；人物评价留空 |
| 默认 / `--score` | 所有模型阶段结束后写 | 完整人物报告 |
| 中途中断 | 没有最终 HTML，但中间 JSON 保留 | `session_narratives.json`、`episode_scores.json` 等可续跑 |

`--score` 期间每完成一个阶段会增量写 JSON；`report.html` 是最后一次性生成的。想先立刻看本地覆盖情况，可以先跑 `--no-score`，之后再跑 `--score`（需要 Key）覆盖成完整报告。没有 Key 且没加 `--score` 时，命令自动走本地模式，不会报错。

## 事件轨迹（trajectory）

每次运行除了 `report.html`，还会生成：

- `trajectory.json`：每个会话的 typed events、信号、steering、决策链和结果；
- `trajectory.html`：本地时间线视图，按事件数展示前 40 个会话。

事件类型对齐公开客户端的 `EventExtractor`：

```text
file_edit / file_create / file_read
git_commit / git_branch_switch / git_push
test_run
error_encountered
bash_command
user_directive
agent_proposal
subagent_dispatch / subagent_return
```

`agent_thinking` 只有在来源本身保留 thinking block 时才会出现；当前多数本地来源只保存可见消息。

每个会话还会计算 Paxel 风格的 `session_signals`，例如：

```text
tool_count / unique_tools / tools_per_message
duration_minutes / messages_per_minute
git_commit_count / files_modified_count
test_run_count / test_pass_rate / tdd_discipline_ratio
error_count / recovery_speed / error_retry_ratio
plan_mode_used / task_tool_used / worktree_used
imperative_prompts / confirmation_requests / kill_decisions
self_corrections / critiques / domain_corrections
hypothesis_driven / debugging_messages / architecture_discussions
substantive_messages / terse_messages / substantive_ratio
```

Steering 使用公开客户端的 10 类：`explore / constrain / delegate / inspect / reject / redirect / verify / ship / debug / recover`。

决策层会生成：

- `decision_edges`：同一会话内相邻决策的 `compounds` 链；
- `outcomes`：决策回应之后最近的 commit / test / error / file edit，带 `outcome_signal`、距离和时间层。

这些是**确定性近似**，不是 Paxel 服务端的 LLM outcome analysis；链检测按时间相邻分组，不做语义相似度/embedding。离线检查：

```bash
python3 tools/smoke-trajectory.py
```

## Prompt profile

默认使用本仓库独立编写的 prompt（`--prompt-profile local`）。如果要对齐公开客户端里的三处 prompt，先在仓库根目录运行：

```bash
bash tools/extract-v15-prompts.sh
```

它会从公开镜像 `ghcr.io/yc-software/paxel-client:sha-07dc3b878811`（应用版本 `0.3.48.2`，2026-07-02）提取评分 v15、会话叙事 v5、叙事合并 v5、决策分类 v5，然后可以用：

```bash
npx --yes github:Afterglowfollower/paxel-test --prompt-profile v15-v5
```

`0.3.48.2` 是**最后一个还带 prompt 正文的公开客户端**。线上 `0.3.83.2`（`latest`）只声明 prompt id（`episode_scoring v16`、`session_narrative v6` 等），正文由服务端注入，公开镜像里没有。人物级综合 prompt 也不在公开客户端里，所以两个 profile 都用本仓库的本地实现；`v15-v5` 表示“三处客户端 prompt 用官方 v15/v5，人物综合仍是本地”，不是官方同分复刻。

prompt 正文不随仓库分发（见 `python/prompts/v15-v5/NOTICE.md`），只在本机生成和使用。官方 v15/v5 prompt 是英文原生，所以这个 profile 下中间叙事和片段事实是英文；报告页面和人物综合仍是中文。这是对原版 prompt 的忠实行为，不是语言 bug。

离线检查：

```bash
python3 tools/smoke-prompt-profiles.py
```

## 性能与并发

本地是“通用 API 客户端 + 有限并发”，不是 YC 服务端那条并行流水线，通常会慢一些：

- 默认 `--concurrency 4`；API 允许时可以调到 8，遇到限流再降回 1；
- 超大会话用 `--max-parts 2` 或更小，避免单段调用超时；
- 范围太大时先缩 `--days 30` 或 `--sources hermes`；
- 重跑会复用已完成的叙事/评分缓存，不会全部重算；
- 只想看本地覆盖，用 `--no-score`，通常几十秒内出报告；
- 切换方舟模型会改变评分口径，建议先小样本对比。

## 数据边界

| 模式 | 外部请求 | 说明 |
| --- | --- | --- |
| `--no-score` | 无模型请求 | 全程本地：读会话、读 Git、写报告；不向模型服务商发送内容，也不需要 Key |
| 默认 / `--score` | 调用所选服务商 API | 把截断后的会话叙事、片段证据、决策候选发给火山方舟；服务商留存策略由服务商决定 |
| Git | 只读本地 | 不 fetch、不 push、不拉远端 PR |
| Hermes / opencode | SQLite 只读 | 不修改数据库 |

发送给模型服务商前会做正则脱敏（token、key、路径、邮箱等），但这是**尽力而为，不是保证**。输出目录里的 `report.html`、`codex-trajectories.html`、`evidence.json`、`narrative_inputs.json` 都可能含私人会话；轨迹页还列出本机原始日志路径，**不要提交、不要外发**。

## 报告与局限

所有输出保存在本机指定的目录，包括 `report.html`、`person_profile.json`、会话证据、候选决策、工作片段和评分输入 JSON。工具本身不会上传到 Paxel 或众测平台。

目前已用原版 Paxel 镜像在断网条件下对照会话发现、片段关联和决策候选阶段。Claude Code 的 41 份文件都被发现，双方各生成 35 个工作片段；原版决策候选 220 条，本工具 216 条。也对照了用户已生成的官方 V3 报告页面：原版的人物叙事远比五个分数丰富。本工具参考其报告层次、公开的五维评分锚点和四类决策分类，但原版服务端的跨会话叙事合成、人物标签生成与校准代码未公开；这些部分是独立实现，不能称为官方同分复刻。公开客户端另有 49 条决策模式目录，本工具尚未逐条映射。逐层状态见 [逆向对照](REVERSE_ENGINEERING.md)。

当前能力边界：

- 不支持 Cursor；opencode 已支持；
- `--all-local` 的 Git 提交只来自本地仓库，不联网拉 PR；
- 不执行测试、不验证部署，测试通过与否只依据可见日志；
- `trajectory.json` 是确定性近似：没有服务端 LLM outcome analysis，没有 embedding/语义链，也没有 step 级环境状态；
- `agent_thinking` 仅在来源保留 thinking block 时可用；
- 原版 v16/v6 prompt 和最终人物合成在服务端，公开 artifact 拿不到；
- `--score` 的人物综合是本地实现，不是官方同分。

此仓库只包含独立复现的 CLI、本地分析代码和 prompt 提取脚本；不包含用户会话、私密报告、官方客户端镜像或 API Key。v15-v5 的 prompt 正文由本地脚本生成，并被 git 忽略。
