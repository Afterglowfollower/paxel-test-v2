#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = path.resolve(__dirname, '..', 'python', 'paxel_reproduction.py');
const raw = process.argv.slice(2);
const has = (name) => raw.includes(name) || raw.some((arg) => arg.startsWith(`${name}=`));

if (has('--help') || has('-h')) {
  console.log(`paxel-test: 在本机分析 AI 编程会话并生成 HTML 报告

用法:
  npx --yes github:Afterglowfollower/paxel-test
  npx --yes github:Afterglowfollower/paxel-test --all-local
  npx --yes github:Afterglowfollower/paxel-test --project /path/to/project

默认读取 ~/.claude/projects 下最近 90 天的全部 Claude Code 会话。
没有 API Key 时自动只生成本地证据报告（不调用模型，不需要任何密钥）。
有 ARK_API_KEY 或 --relay 时才会追加模型评价。

选项:
  --project PATH       只分析一个项目，可同时读取该项目的 Codex/Claude 会话和 Git
  --claude-dir PATH    自定义 Claude Code 会话目录
  --codex-dir PATH     自定义 Codex 会话目录
  --all-local          汇总 Claude Code、Codex、Hermes、DeepSeek harness 和 opencode 会话
  --sources LIST       只分析指定来源：claude,codex,hermes,deepseek,opencode（默认全部）
  --max-parts N        跳过需要超过 N 段叙事的超大会话（0 = 不限制）
  --hermes-db PATH     Hermes SQLite 数据库，默认 ~/.hermes/state.db
  --dsh-dir PATH       DeepSeek harness 的 sessions 目录
  --opencode-dir PATH  opencode 数据目录或单个 opencode*.db
  --concurrency N      模型调用并发数，默认 4；1 = 串行
  --days N             分析最近 N 天，默认 90；0 = 不限时间范围
  --output-dir PATH    报告目录，默认 ./paxel-report
  --score              强制调用模型；需要 ARK_API_KEY 或 --relay
  --api-key-file PATH  从指定文件读取 key（默认 ~/.config/paxel-test/ark_api_key）
  --relay URL          走共享中转，不需要本地 key；令牌用 PAXEL_RELAY_TOKEN 提供
  --request-timeout N  单次模型请求超时秒数，默认 240
  --thinking MODE      auto | disabled；默认 disabled，关掉推理 token 以加快抽取类任务
  --prompt-profile P   local（默认）或 v15-v5（需先运行 tools/extract-v15-prompts.sh）
  --no-score           只生成本地证据报告，不调用模型
  --model NAME         模型 ID；方舟默认 doubao-seed-2-1-pro-260915

报告在输出目录的 report.html；同时生成 trajectory.json / trajectory.html（事件轨迹与信号）。完整底层参数见 python/paxel_reproduction.py。
`);
  process.exit(0);
}

const args = [];
let project = null;
let noScore = false;
let hasOutputDir = false;
let hasScore = false;
let apiKeyFile = null;
for (let i = 0; i < raw.length; i += 1) {
  const arg = raw[i];
  if (arg === '--project') {
    if (!raw[i + 1]) {
      console.error('--project 需要一个目录');
      process.exit(2);
    }
    project = raw[++i];
  } else if (arg === '--no-score') {
    noScore = true;
  } else if (arg === '--api-key-file') {
    if (!raw[i + 1]) {
      console.error('--api-key-file 需要一个文件路径');
      process.exit(2);
    }
    apiKeyFile = raw[++i];
    args.push('--api-key-file', apiKeyFile);
  } else if (arg.startsWith('--api-key-file=')) {
    apiKeyFile = arg.slice('--api-key-file='.length);
    args.push(arg);
  } else {
    if (arg === '--output-dir') hasOutputDir = true;
    if (arg === '--score') hasScore = true;
    args.push(arg);
  }
}

function defaultApiKeyFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'paxel-test', 'ark_api_key');
}

function apiKeyAvailable() {
  if (process.env.ARK_API_KEY && process.env.ARK_API_KEY.trim()) return true;
  const candidates = apiKeyFile ? [apiKeyFile] : [defaultApiKeyFile()];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) return true;
    } catch (error) {
      // Unreadable candidates are treated as absent; the Python resolver will
      // produce the final error if none can be read.
    }
  }
  return false;
}

const useRelay = has('--relay');

if (project) {
  args.unshift(project);
} else if (!has('--all-claude') && !has('--all-local')) {
  args.unshift('--all-claude');
}
if (!hasOutputDir) {
  args.push('--output-dir', path.resolve(process.cwd(), 'paxel-report'));
}

let scoring = false;
if (noScore) {
  if (hasScore) {
    console.error('--score 和 --no-score 不能同时使用');
    process.exit(2);
  }
  args.push('--no-score');
} else if (useRelay || apiKeyAvailable()) {
  if (!hasScore) args.push('--score');
  scoring = true;
} else if (hasScore) {
  console.error('模型评价需要 ARK_API_KEY 或 --relay。可以：\n' +
    '  1) 设置 ARK_API_KEY 环境变量\n' +
    '  2) python3 tools/set-api-key.py\n' +
    '  3) --api-key-file /path/to/key\n' +
    '  4) --relay https://你的中转地址（不需要本地 key）\n' +
    '只想生成本地证据报告，去掉 --score 或加 --no-score。');
  process.exit(2);
} else {
  args.push('--no-score');
}

const target = useRelay ? '共享中转（key 由中转服务持有）' : '火山方舟';
console.log(scoring
  ? `正在生成模型评价报告。会话片段将发送到 ${target}。`
  : '正在生成本地证据报告（未调用模型，不需要 API Key）。');
const python = process.env.PAXEL_PYTHON || 'python3';
const result = spawnSync(python, [cli, ...args], { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(`无法启动 ${python}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
