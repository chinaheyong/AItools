# API-image Skill 配置说明

本项目直接调用兼容 OpenAI 图片接口的中继服务，不依赖 `relay_imagegen` MCP Server。

## Windows 安装

1. 将 `api-image` 文件夹复制到 `%CODEX_HOME%\skills\api-image`。如果没有设置 `CODEX_HOME`，使用 `%USERPROFILE%\.codex\skills\api-image`。
2. 双击 `configure-api-image.cmd`，根据提示输入中继 URL 和专用 API Key。输入 API Key 时不会显示字符。
3. 重启 Codex，使 Skill 在新进程中被发现。

也可以在 PowerShell 中手动配置当前用户的环境变量：

```powershell
[Environment]::SetEnvironmentVariable("CODEX_IMAGE_RELAY_BASE_URL", "https://your-relay.example.com/v1", "User")
[Environment]::SetEnvironmentVariable("CODEX_IMAGE_RELAY_API_KEY", "请替换为中继专用密钥", "User")
[Environment]::SetEnvironmentVariable("CODEX_IMAGE_RELAY_MODEL", "gpt-image-2.5-sunburst", "User")
```

不要把密钥写进 Skill 文件夹、Git 仓库或聊天记录，也不要使用通用 OpenAI 账号密钥代替中继专用密钥。

## 在 Codex 中使用

需要确保使用该中继时，显式调用 `$api-image`：

```text
$api-image 生成一张白色陶瓷杯的电商产品图，正方形，高质量。
```

## 不产生图片费用的测试

```powershell
node scripts/image_relay.mjs --help
```

## 命令行生成图片

```powershell
node scripts/image_relay.mjs generate --prompt "A clean product photo of a white ceramic mug" --model gpt-image-2.5-sunburst --size 1024x1024 --quality high
```

## 命令行编辑图片

```powershell
node scripts/image_relay.mjs edit --input "C:\path\source.png" --prompt "Change only the background; keep the product, shape, edges, and label unchanged" --model gpt-image-2.5-sunburst
```

命令会输出 JSON，其中包含生成图片的绝对路径。默认保存位置是 `%CODEX_HOME%\generated_images\relay`。

## 中继协议要求

中继服务必须支持：

- `POST /images/generations`
- `POST /images/edits`
- Bearer 身份验证
- 返回包含 `data[].b64_json` 或 `data[].url` 的 JSON

如果中继改变了请求或响应结构，应更新 `scripts/image_relay.mjs`。项目不会自动重试可能产生费用的图片请求，以免出现重复图片和重复计费。
