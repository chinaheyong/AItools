---
name: api-image
description: Generate or edit raster images through a configured OpenAI-compatible relay API with an explicit image model. Use this when a trusted image relay is configured and stable model selection or reproducible routing is required. Do not use it without a dedicated relay API key.
metadata:
  short-description: Generate images through a trusted relay API
---

# API-image

Use the bundled `scripts/image_relay.mjs` helper for all generation and editing in this skill. The helper calls the relay HTTP API directly, saves image files locally, and prints machine-readable output.

## Configuration

Required on each computer:

- `CODEX_IMAGE_RELAY_BASE_URL`: relay base URL, for example `https://relay.example.com/v1`.
- `CODEX_IMAGE_RELAY_API_KEY`: API key for the relay. Never write it into this skill or a shared file.

Optional:

- `CODEX_IMAGE_RELAY_MODEL`: default model. Defaults to `gpt-image-2.5-sunburst` for consistent final output.
- `CODEX_IMAGE_RELAY_OUTPUT_DIR`: output directory. Defaults to `$CODEX_HOME/generated_images/relay`.
- `CODEX_IMAGE_RELAY_TIMEOUT_MS`: request timeout. Defaults to 900000.

Do not reuse a general OpenAI account key for this relay. The helper intentionally accepts only the dedicated `CODEX_IMAGE_RELAY_API_KEY` variable.

## Workflow

1. Decide whether the request is a new image or an edit.
2. Keep the model explicit. Use `CODEX_IMAGE_RELAY_MODEL` unless the user requests another supported model.
3. Run the helper directly:
   - Generate: `node scripts/image_relay.mjs generate --prompt "..."`
   - Edit: `node scripts/image_relay.mjs edit --input "C:\\path\\image.png" --prompt "..."`
4. Use `--size`, `--quality`, `--count`, and `--filename` when the user specifies them.
5. Read the JSON result, inspect the saved image with `view_image` when visual validation matters, and report the absolute path and model used.

Supported relay model identifiers are `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, and `gpt-image-2`. These are relay-specific identifiers and are not presented as official OpenAI model names. The API is expected to be OpenAI-compatible:

- `POST /images/generations` with JSON.
- `POST /images/edits` with multipart form data.
- A JSON response containing `data[]` items with either `b64_json` or `url`.

The helper does not automatically retry paid generation requests by default. This avoids silently creating duplicate images and charges. If retries are needed, add them at the relay gateway with idempotency support rather than hiding them in the Skill.

Never print, echo, commit, or transmit the API key except as the HTTP authorization header required by the relay. Do not fall back to the built-in image generator or MCP when this Skill is selected; report configuration or relay errors clearly instead.
