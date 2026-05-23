# stemsplit-mcp

[![npm](https://img.shields.io/npm/v/stemsplit-mcp)](https://www.npmjs.com/package/stemsplit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server for [StemSplit](https://stemsplit.io). Separate vocals, drums, bass, piano, guitar, and other stems from local audio files, direct audio URLs, or YouTube videos — directly inside Claude Desktop, Cursor, Cline, Windsurf, Zed, or any other MCP-compatible client.

The server exchanges file paths and JSON over MCP. Audio bytes never pass through the model's context — they flow directly between your machine, StemSplit's API, and Cloudflare R2.

---

## What it does

| Tool | Use case |
|------|----------|
| `separate_stems` | Upload a local audio file or pass a direct audio URL; get back local file paths to the separated stems |
| `separate_youtube` | Submit a YouTube URL; get back local file paths to the vocals and instrumental stems |
| `get_job` / `list_jobs` | Inspect existing stem jobs |
| `get_youtube_job` / `list_youtube_jobs` | Inspect existing YouTube jobs |
| `get_balance` | Check remaining credits |
| `download_stems` | Re-download outputs from a completed job |

Plus four ready-made prompts: `karaoke`, `isolate_dialogue`, `sampler_pack`, `youtube_instrumental`.

---

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "stemsplit": {
      "command": "npx",
      "args": ["-y", "stemsplit-mcp"],
      "env": {
        "STEMSPLIT_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. Type `/karaoke` or just ask: *"Separate the vocals from ~/Music/demo.mp3"*.

### Cursor

Add to `~/.cursor/mcp.json` (or per-workspace `<workspace>/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "stemsplit": {
      "command": "npx",
      "args": ["-y", "stemsplit-mcp"],
      "env": {
        "STEMSPLIT_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Cline, Windsurf, Zed, others

Any MCP client that supports stdio-launched servers works. Use the same `npx -y stemsplit-mcp` command and pass `STEMSPLIT_API_KEY` via the client's env mechanism.

### Get an API key

1. Sign up at [stemsplit.io](https://stemsplit.io)
2. Open [stemsplit.io/app/settings/api](https://stemsplit.io/app/settings/api)
3. Generate a key (format: `sk_live_...`)
4. Paste it into your MCP client config as shown above

---

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `STEMSPLIT_API_KEY` | Yes | — | API key, must start with `sk_live_` |
| `STEMSPLIT_API_BASE_URL` | No | `https://stemsplit.io/api/v1` | Override for self-hosted or staging |
| `STEMSPLIT_DEFAULT_OUTPUT_DIR` | No | `~/Downloads/stemsplit` | Base directory where stems are saved. Each job gets a `<jobId>/` subdirectory unless you pass `outputDir` to the tool call |

---

## Tool reference

### `separate_stems`

Submit an audio file or direct URL for stem separation.

```json
{
  "source": "/Users/me/Music/song.mp3",
  "outputType": "BOTH",
  "quality": "BEST",
  "outputFormat": "MP3",
  "wait": true
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `source` | string (required) | — | Local path (absolute or `~/...`) or direct `https://` audio URL. **Do not** pass YouTube URLs here; use `separate_youtube` |
| `outputType` | `VOCALS` \| `INSTRUMENTAL` \| `BOTH` \| `FOUR_STEMS` \| `SIX_STEMS` | `BOTH` | `SIX_STEMS` requires `quality=BEST` |
| `quality` | `FAST` \| `BALANCED` \| `BEST` | `BEST` | |
| `outputFormat` | `MP3` \| `WAV` \| `FLAC` | `MP3` | |
| `fileName` | string | derived | Display name for the job |
| `wait` | boolean | `true` | If true, poll until done and download stems to disk |
| `timeoutSeconds` | integer | `600` | Max wait when `wait=true` |
| `pollIntervalSeconds` | integer | `5` | |
| `outputDir` | string | `~/Downloads/stemsplit/<jobId>/` | Where to write stems |

**Returns (wait=true):**

```json
{
  "jobId": "job_abc123",
  "status": "COMPLETED",
  "creditsCharged": 180,
  "outputDir": "/Users/me/Downloads/stemsplit/job_abc123",
  "stems": {
    "vocals": "/Users/me/Downloads/stemsplit/job_abc123/vocals.mp3",
    "instrumental": "/Users/me/Downloads/stemsplit/job_abc123/instrumental.mp3"
  }
}
```

### `separate_youtube`

Same shape, but takes `youtubeUrl` instead of `source`. Output is fixed to vocals + instrumental, MP3, BEST quality (this is the StemSplit API's contract for YouTube jobs).

### `get_job`, `list_jobs`, `get_youtube_job`, `list_youtube_jobs`, `get_balance`, `download_stems`

Thin wrappers over the corresponding StemSplit `/api/v1` endpoints. `download_stems` re-fetches the job first to mint fresh 1-hour presigned URLs, so the expiry never matters.

---

## Resources

Read-only context the LLM can pull on demand.

| URI | Returns |
|-----|---------|
| `stemsplit://balance` | Live credit balance |
| `stemsplit://jobs/recent` | The 20 most recent stem jobs |
| `stemsplit://jobs/{jobId}` | Detail snapshot with fresh download URLs |
| `stemsplit://youtube-jobs/{jobId}` | YouTube job detail with fresh URLs |

---

## Prompts (slash commands)

| Prompt | Argument | Behavior |
|--------|----------|----------|
| `karaoke` | `source` | Run `separate_stems` (`BOTH`) and hand back the instrumental path |
| `isolate_dialogue` | `source` | Run `separate_stems` (`VOCALS`) for podcast cleanup or transcription prep |
| `sampler_pack` | `source` | Run `separate_stems` (`SIX_STEMS`, `BEST`) and list every stem path |
| `youtube_instrumental` | `youtubeUrl` | Run `separate_youtube` and hand back the instrumental path |

---

## Example sessions

**Karaoke from a local file (Claude Desktop):**

> Make a karaoke version of `~/Music/demo.mp3`.

Claude calls `separate_stems` with `outputType="BOTH"`, polls for ~60s, and returns:

```
Done. Karaoke (instrumental) is at:
/Users/me/Downloads/stemsplit/job_abc123/instrumental.mp3
```

**Six-stem sampler pack (Cursor):**

> Split `./loops/break.wav` into all six stems for sampling.

Cursor calls `separate_stems` with `outputType="SIX_STEMS"`, `quality="BEST"`, `outputDir="./loops/break-stems"`, and reports each file path so you can drop them into your DAW.

**Instrumental from YouTube:**

> Get me the instrumental of `https://youtu.be/dQw4w9WgXcQ`.

Claude calls `separate_youtube`, polls until COMPLETED, downloads `vocals.mp3` and `instrumental.mp3` to `~/Downloads/stemsplit/<jobId>/`, and returns the instrumental path.

---

## Supported inputs

- **Local files:** `mp3`, `wav`, `flac`, `m4a`, `ogg`, `webm`, `aac`, `wma`
- **Direct URLs:** any public `https://` URL serving one of the formats above (the StemSplit API fetches it server-side)
- **YouTube:** `youtube.com/watch?v=...`, `youtu.be/...`, `youtube-nocookie.com/embed/...`, or a bare 11-character video ID

**Limits:** 100 MB / 60 minutes per file. 1 credit = 1 second of audio. Credits are deducted at job submission.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `STEMSPLIT_API_KEY is required` | Set the env var in your MCP client config |
| `[INVALID_API_KEY_FORMAT]` | Key must start with `sk_live_`. Generate a fresh one at [stemsplit.io/app/settings/api](https://stemsplit.io/app/settings/api) |
| `[INSUFFICIENT_CREDITS]` | The error includes a `purchaseUrl`. Top up at [stemsplit.io/app/billing](https://stemsplit.io/app/billing) |
| `[RATE_LIMIT_EXCEEDED]` | Default per-key limit is 60 requests/minute. The error includes `retryAfterSeconds` |
| `[FILE_TOO_LARGE]` / `[AUDIO_TOO_LONG]` | Trim or compress the file. Limits are 100 MB and 60 minutes |
| `[POLL_TIMEOUT]` | Increase `timeoutSeconds` on the tool call or set `wait: false` and poll `get_job` separately |
| YouTube URL passed to `separate_stems` | Use `separate_youtube` instead |

---

## Development

```bash
git clone https://github.com/StemSplit/stemsplit-mcp
cd stemsplit-mcp
npm install
npm run typecheck
npm run lint
npm test
npm run build

STEMSPLIT_API_KEY=sk_live_... npm run inspect
```

`npm run inspect` launches the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive testing.

---

## License

MIT (c) 2026 StemSplit

---

## Related

- [StemSplit](https://stemsplit.io)
- [StemSplit API docs](https://stemsplit.io/docs/api)
- [n8n-nodes-stemsplit](https://www.npmjs.com/package/n8n-nodes-stemsplit) — n8n community node
- [stemsplit-python](https://pypi.org/project/stemsplit-python/) — Python SDK
- [stemsplit CLI](https://github.com/StemSplit/stemsplit-cli) — command-line tool
