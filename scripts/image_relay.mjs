#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomBytes, randomUUID } from "node:crypto";

const MODELS = new Set([
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
]);

const SIZES = new Set([
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);

const QUALITIES = new Set(["low", "medium", "high", "xhigh", "max", "auto"]);
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const DEFAULT_TIMEOUT_MS = 900000;

function usage() {
  return `Usage:
  node scripts/image_relay.mjs generate --prompt "..." [options]
  node scripts/image_relay.mjs edit --input "image.png" --prompt "..." [options]

Options:
  --model <name>       Image model
  --size <WxH|auto>    Output size
  --quality <value>    low, medium, high, xhigh, max, or auto
  --count <n>          Number of generated variants, 1-4
  --filename <stem>    ASCII-friendly output filename stem
  --output-dir <path>  Output directory
  --timeout-ms <n>     HTTP timeout in milliseconds
  --help               Show this help

Environment:
  CODEX_IMAGE_RELAY_BASE_URL  Relay base URL, including /v1 when required
  CODEX_IMAGE_RELAY_API_KEY   Relay API key
  CODEX_IMAGE_RELAY_MODEL     Default image model
  CODEX_IMAGE_RELAY_OUTPUT_DIR Default output directory
  CODEX_IMAGE_RELAY_TIMEOUT_MS Default timeout
`;
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") {
    return { command: "help", values: {} };
  }

  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      return { command: "help", values: {} };
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    values[key] = next;
    index += 1;
  }

  return { command, values };
}

function getCodexHome() {
  return process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || ".", ".codex");
}

async function getApiKey() {
  if (process.env.CODEX_IMAGE_RELAY_API_KEY) {
    return process.env.CODEX_IMAGE_RELAY_API_KEY;
  }
  throw new Error("Missing CODEX_IMAGE_RELAY_API_KEY");
}

function getBaseUrl() {
  const raw = process.env.CODEX_IMAGE_RELAY_BASE_URL || process.env.RELAY_BASE_URL;
  if (!raw) {
    throw new Error("Missing CODEX_IMAGE_RELAY_BASE_URL or RELAY_BASE_URL");
  }
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function getNumber(value, name, fallback, min, max) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function chooseValue(value, envName, fallback, allowed, label) {
  const selected = value || process.env[envName] || fallback;
  if (!allowed.has(selected)) {
    throw new Error(`Unsupported ${label}: ${selected}`);
  }
  return selected;
}

function validateModelQuality(model, quality) {
  if (model === "gpt-image-2" && (quality === "xhigh" || quality === "max")) {
    throw new Error(`${quality} quality requires a GPT Image 2.5 model`);
  }
}

function sanitizeFilename(value) {
  const stem = (value || "relay-image")
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "relay-image";
}

function detectImageType(bytes, contentType = "") {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
  if (normalized === "image/png") return { extension: "png", mimeType: normalized };
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (normalized === "image/webp") return { extension: "webp", mimeType: normalized };
  return null;
}

function makeEndpoint(baseUrl, relativePath) {
  return new URL(relativePath.replace(/^\/+/, ""), baseUrl).toString();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Relay request timed out after ${timeoutMs} ms`);
    }
    throw new Error(`Relay request could not be completed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Relay returned non-JSON data with HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || text.slice(0, 300);
    throw new Error(`Relay image request failed with HTTP ${response.status}: ${message}`);
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("Relay response did not contain a non-empty data array");
  }
  return payload;
}

function dataUrlToBuffer(value) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  if (match[2]) return { bytes: Buffer.from(match[3], "base64"), contentType: match[1] || "" };
  return { bytes: Buffer.from(decodeURIComponent(match[3]), "utf8"), contentType: match[1] || "" };
}

async function itemToBuffer(item, baseUrl, apiKey, timeoutMs) {
  if (typeof item?.b64_json === "string" && item.b64_json) {
    const dataUrl = dataUrlToBuffer(item.b64_json);
    if (dataUrl) return dataUrl;
    return { bytes: Buffer.from(item.b64_json, "base64"), contentType: "" };
  }

  if (typeof item?.url === "string" && item.url) {
    const inline = dataUrlToBuffer(item.url);
    if (inline) return inline;
    const url = new URL(item.url, baseUrl).toString();
    const headers = { Accept: "image/*" };
    if (process.env.CODEX_IMAGE_RELAY_FORWARD_AUTH_TO_IMAGE_URL === "1") {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetchWithTimeout(url, { headers }, timeoutMs);
    if (!response.ok) {
      throw new Error(`Image download failed with HTTP ${response.status}`);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "",
    };
  }

  throw new Error("Relay response item did not contain b64_json or url");
}

async function saveImages(payload, options, baseUrl, apiKey, timeoutMs) {
  const outputDir = path.resolve(
    options.outputDir ||
      process.env.CODEX_IMAGE_RELAY_OUTPUT_DIR ||
      path.join(getCodexHome(), "generated_images", "relay"),
  );
  await mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const suffix = randomBytes(3).toString("hex");
  const stem = sanitizeFilename(options.filename);
  const files = [];

  for (let index = 0; index < payload.data.length; index += 1) {
    const item = payload.data[index];
    const image = await itemToBuffer(item, baseUrl, apiKey, timeoutMs);
    const imageType = detectImageType(image.bytes, image.contentType);
    if (!imageType) {
      throw new Error("Relay returned bytes that are not a supported PNG, JPEG, or WebP image");
    }

    const numberedStem = payload.data.length > 1 ? `${stem}-${index + 1}` : stem;
    const outputPath = path.join(outputDir, `${numberedStem}-${stamp}-${suffix}.${imageType.extension}`);
    await writeFile(outputPath, image.bytes, { flag: "wx" });
    files.push({
      path: outputPath,
      mimeType: imageType.mimeType,
      revisedPrompt: item?.revised_prompt || null,
    });
  }

  return files;
}

function buildCommonOptions(values, operation) {
  const model = chooseValue(
    values.model,
    "CODEX_IMAGE_RELAY_MODEL",
    DEFAULT_MODEL,
    MODELS,
    "model",
  );
  const size = chooseValue(values.size, "CODEX_IMAGE_RELAY_SIZE", operation === "edit" ? "auto" : "1024x1024", SIZES, "size");
  const quality = chooseValue(values.quality, "CODEX_IMAGE_RELAY_QUALITY", operation === "edit" ? "high" : "medium", QUALITIES, "quality");
  validateModelQuality(model, quality);
  const count = getNumber(values.count, "count", 1, 1, 4);
  const timeoutMs = getNumber(
    values.timeoutMs,
    "timeout-ms",
    Number(process.env.CODEX_IMAGE_RELAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    1000,
    3600000,
  );
  return { model, size, quality, count, timeoutMs };
}

async function generate(values) {
  if (!values.prompt) throw new Error("generate requires --prompt");
  const options = buildCommonOptions(values, "generate");
  const baseUrl = getBaseUrl();
  const apiKey = await getApiKey();
  const response = await fetchWithTimeout(
    makeEndpoint(baseUrl, "images/generations"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        model: options.model,
        prompt: values.prompt,
        n: options.count,
        size: options.size,
        quality: options.quality,
        output_format: "png",
      }),
    },
    options.timeoutMs,
  );
  const payload = await parseJsonResponse(response);
  const files = await saveImages(payload, values, baseUrl, apiKey, options.timeoutMs);
  return { operation: "generate", model: options.model, files };
}

async function edit(values) {
  if (!values.input) throw new Error("edit requires --input");
  if (!values.prompt) throw new Error("edit requires --prompt");
  const options = buildCommonOptions(values, "edit");
  const baseUrl = getBaseUrl();
  const apiKey = await getApiKey();
  const sourceBytes = await readFile(path.resolve(values.input));
  const sourceType = detectImageType(sourceBytes);
  if (!sourceType) {
    throw new Error("The input file is not a supported PNG, JPEG, or WebP image");
  }

  const form = new FormData();
  form.append("model", options.model);
  form.append("prompt", values.prompt);
  form.append("image", new Blob([sourceBytes], { type: sourceType.mimeType }), path.basename(values.input));
  form.append("n", "1");
  form.append("size", options.size);
  form.append("quality", options.quality);
  form.append("output_format", "png");

  const response = await fetchWithTimeout(
    makeEndpoint(baseUrl, "images/edits"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: form,
    },
    options.timeoutMs,
  );
  const payload = await parseJsonResponse(response);
  const files = await saveImages(payload, values, baseUrl, apiKey, options.timeoutMs);
  return { operation: "edit", model: options.model, files };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === "help") {
    process.stdout.write(usage());
    return;
  }

  const result = command === "generate" ? await generate(values) : command === "edit" ? await edit(values) : null;
  if (!result) throw new Error(`Unknown command: ${command}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
});
