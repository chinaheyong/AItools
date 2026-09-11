# API-image：通过自定义中继 API 生成和编辑图片

`API-image` 是一个面向 Codex 的图片生成 Skill。它通过你配置的、兼容 OpenAI 图片接口的中继服务调用指定模型，将生成结果保存到本地，并向 Codex 返回结构化 JSON。

> 本仓库只包含 Skill 和调用脚本，不提供中继服务，也不包含任何 API Key。

## 能做什么

- 根据文字提示生成 PNG 图片。
- 基于 PNG、JPEG 或 WebP 原图进行编辑。
- 指定模型、尺寸、质量、数量和输出文件名。
- 处理中继返回的 Base64 图片或图片 URL。
- 将结果保存到本地，并返回图片路径、MIME 类型和修订后的提示词。
- 为每次生成请求附加幂等标识，同时默认不自动重试付费请求，降低重复生成和重复计费风险。

## 适合什么场景

- 公司或团队已经有可信的图片 API 中继。
- 需要固定模型路由，而不是让系统自动选择模型。
- 希望生成流程可复现，并能明确知道实际调用的模型。
- 希望绕过额外 MCP 层，直接调用兼容的 HTTP 接口。

它不负责部署中继服务，也不适合在来源不明的中继上使用。中继运营方能够接触你发送的提示词、原图和中继 API Key，因此必须确认服务可信。

## 环境要求

- Codex
- Node.js 18 或更高版本
- 一个支持以下接口的可信中继服务：
  - `POST /images/generations`
  - `POST /images/edits`
- 中继服务提供的专用 API Key

## 安装

### Windows

```powershell
git clone https://github.com/chinaheyong/AItools.git "$env:USERPROFILE\.codex\skills\api-image"
cd "$env:USERPROFILE\.codex\skills\api-image"
.\configure-api-image.cmd
```

根据窗口提示输入中继 URL 和 API Key，完成后重启 Codex。也可以运行 `install.ps1`，将当前目录的 Skill 安装到指定的 Codex Home。

### macOS / Linux

```bash
git clone https://github.com/chinaheyong/AItools.git ~/.codex/skills/api-image
export CODEX_IMAGE_RELAY_BASE_URL="https://your-relay.example.com/v1"
export CODEX_IMAGE_RELAY_API_KEY="请替换为中继专用密钥"
export CODEX_IMAGE_RELAY_MODEL="gpt-image-2.5-sunburst"
```

环境变量需要对启动 Codex 的进程可见。配置后重启 Codex。

## 在 Codex 中使用

生成图片：

```text
$api-image 生成一张白色陶瓷杯的电商主图，纯白背景，柔和棚拍光线，1024×1024，高质量。
```

编辑图片：

```text
$api-image 编辑这张产品图：只把背景改成浅灰色，保持产品形状、边缘和标签完全不变。
```

## 直接使用命令行

查看帮助，不会发起付费图片请求：

```bash
node scripts/image_relay.mjs --help
```

生成图片：

```bash
node scripts/image_relay.mjs generate \
  --prompt "A clean product photo of a white ceramic mug" \
  --model gpt-image-2.5-sunburst \
  --size 1024x1024 \
  --quality high
```

编辑图片：

```bash
node scripts/image_relay.mjs edit \
  --input "/absolute/path/source.png" \
  --prompt "Change only the background; keep the product unchanged" \
  --model gpt-image-2.5-sunburst
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--model` | 指定中继模型 |
| `--size` | 指定输出尺寸或 `auto` |
| `--quality` | `low`、`medium`、`high`、`xhigh`、`max` 或 `auto` |
| `--count` | 生成 1–4 张变体 |
| `--filename` | 指定输出文件名主体 |
| `--output-dir` | 指定输出目录 |
| `--timeout-ms` | 指定请求超时时间 |

默认输出目录为 `$CODEX_HOME/generated_images/relay`。命令成功后会输出类似：

```json
{
  "ok": true,
  "operation": "generate",
  "model": "gpt-image-2.5-sunburst",
  "files": [
    {
      "path": "/absolute/path/relay-image.png",
      "mimeType": "image/png",
      "revisedPrompt": null
    }
  ]
}
```

## 配置项

| 环境变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `CODEX_IMAGE_RELAY_BASE_URL` | 是 | 中继基础 URL，按服务要求包含 `/v1` |
| `CODEX_IMAGE_RELAY_API_KEY` | 是 | 中继专用 API Key |
| `CODEX_IMAGE_RELAY_MODEL` | 否 | 默认模型 |
| `CODEX_IMAGE_RELAY_OUTPUT_DIR` | 否 | 默认输出目录 |
| `CODEX_IMAGE_RELAY_TIMEOUT_MS` | 否 | 默认超时时间，单位为毫秒 |

当前脚本接受的中继模型标识为 `gpt-image-2.5-sunburst`、`gpt-image-2.5-flare` 和 `gpt-image-2`。这些是中继侧模型标识，不代表 OpenAI 官方公开模型名称；能否使用取决于你的中继服务。

## 安全说明

- 只使用中继服务专用 API Key，不要复用通用 OpenAI 账号密钥。
- 不要把 API Key 写进仓库、Skill 文件、命令示例或聊天记录。
- `.gitignore` 已排除常见密钥文件、`.env`、`auth.json` 和生成图片目录。
- 默认不会把 Authorization 请求头转发给图片下载 URL。
- 不建议启用 `CODEX_IMAGE_RELAY_FORWARD_AUTH_TO_IMAGE_URL=1`；除非你完全信任中继返回的下载地址并确认它确实需要鉴权。
- 图片生成可能产生费用。脚本默认不自动重试失败的付费请求。

## 项目结构

```text
api-image/
├── SKILL.md                    # Skill 的行为和调用规则
├── agents/openai.yaml          # Codex 界面元数据
├── scripts/image_relay.mjs     # 图片生成与编辑脚本
├── configure-api-image.cmd     # Windows 安全配置向导
├── install.ps1                 # Windows 安装脚本
└── SETUP.md                    # 补充配置说明
```

## 已知限制

- 中继必须兼容本项目约定的请求和响应结构。
- 编辑模式当前一次只生成一张结果图。
- 仅识别 PNG、JPEG 和 WebP。
- 本项目不会验证中继模型的真实供应商或底层实现。
- 仓库目前未附带开源许可证；默认版权仍归作者所有。
