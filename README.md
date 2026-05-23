# stemsplit-mcp

[![npm](https://img.shields.io/npm/v/stemsplit-mcp)](https://www.npmjs.com/package/stemsplit-mcp)
[![npm downloads](https://img.shields.io/npm/dm/stemsplit-mcp)](https://www.npmjs.com/package/stemsplit-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**AI stem separation as a Model Context Protocol (MCP) server.** Remove vocals, build karaoke tracks, isolate dialogue, or split any song into vocals, drums, bass, piano, guitar, and other stems — directly from Claude Desktop, Cursor, Cline, Windsurf, Zed, or any other MCP-compatible client. Works with local audio files (MP3, WAV, FLAC, M4A, OGG, AAC) and YouTube URLs.

Powered by the [StemSplit](https://stemsplit.io) API (HTDemucs / Demucs models on GPU). The server exchanges only file paths and JSON over MCP — audio bytes never pass through the LLM context. They flow directly between your machine, StemSplit's API, and Cloudflare R2.

---

## What you can do with this

- **Remove vocals from a song** — separate any MP3, WAV, or FLAC into vocals and instrumental
- **Build a karaoke version of any track** — `/karaoke` slash command returns just the instrumental
- **Isolate dialogue or vocals for transcription** — clean speech for podcast editing, interview cleanup, ML preprocessing
- **Extract drums, bass, piano, or guitar** — split audio into up to six individual stems
- **Process YouTube videos** — paste a `youtube.com` or `youtu.be` URL and get separated stems back
- **Build audio agents in your IDE** — orchestrate stem separation from Cursor or Claude Desktop using natural language
- **Batch process audio in MCP-driven pipelines** — chain stem separation with transcription, translation, or any other MCP tool

---

## MCP clients supported

`stemsplit-mcp` runs as a local stdio MCP server, so it works in any client that supports the standard MCP transport:

- [Claude Desktop](https://claude.ai/download) (Anthropic)
- [Cursor](https://cursor.com)
- [Cline](https://github.com/cline/cline) (VS Code extension)
- [Windsurf](https://codeium.com/windsurf) (Codeium)
- [Zed](https://zed.dev)
- Any client following the [Model Context Protocol specification](https://modelcontextprotocol.io)

---

## Tools, resources, and prompts

| Tool | Use case |
|------|----------|
| `separate_stems` | Upload a local audio file or pass a direct audio URL; get back local file paths to the separated stems |
| `separate_youtube` | Submit a YouTube URL; get back local file paths to the vocals and instrumental stems |
| `get_job` / `list_jobs` | Inspect existing stem jobs |
| `get_youtube_job` / `list_youtube_jobs` | Inspect existing YouTube jobs |
| `get_balance` | Check remaining StemSplit credits |
| `download_stems` | Re-download outputs from a completed job (re-mints fresh 1-hour presigned URLs) |

Plus four ready-made prompts (slash commands): `karaoke`, `isolate_dialogue`, `sampler_pack`, `youtube_instrumental`.

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

## FAQ

### How do I remove vocals from a song in Claude Desktop?

Add the install snippet above to `claude_desktop_config.json`, restart Claude, then ask:

> Remove the vocals from `~/Music/song.mp3`.

Claude calls the `separate_stems` tool, waits for the job to complete (~30–60s for a 3-minute track), and hands back the local path to the instrumental file. Or use the `/karaoke` slash command directly.

### Can this work with YouTube URLs?

Yes. Use the `separate_youtube` tool or the `/youtube_instrumental` slash command. The StemSplit API handles the YouTube download server-side and returns vocals + instrumental stems. Output is fixed to vocals + instrumental, MP3, BEST quality.

### What stems can I extract?

Vocals, instrumental, drums, bass, other, piano, and guitar. Six-stem output (adding piano and guitar) requires `quality=BEST` and is only available for stem jobs (not YouTube jobs).

### How is this different from the StemSplit web app?

The [web app](https://stemsplit.io) is point-and-click. This MCP server lets you orchestrate stem separation through natural-language prompts to an LLM, or programmatic tool calls from any MCP client. Same backend (HTDemucs / Demucs on GPU), different interface. Use the web app for one-off jobs; use the MCP server when you want to chain stem separation with other tools (transcription, translation, agentic pipelines) inside an LLM-driven workflow.

### Does this run the AI model locally?

No. The MCP server is a local stdio process that talks to the StemSplit cloud API over HTTPS. Audio bytes are uploaded directly to Cloudflare R2 via presigned PUT (your API key never crosses the network with the audio). Stem separation runs on StemSplit's GPU workers. If you want fully local separation, look at [demucs](https://github.com/adefossez/demucs) or [demucs-onnx](https://github.com/StemSplit/demucs-onnx).

### How much does it cost?

StemSplit uses a pay-per-second model: 1 credit = 1 second of audio. Credits are deducted at job submission. New accounts include free credits. Check current pricing at [stemsplit.io/pricing](https://stemsplit.io/pricing).

### What audio formats are supported?

Input: MP3, WAV, FLAC, M4A, OGG, WebM, AAC, WMA (up to 100 MB / 60 minutes). Output: MP3, WAV, or FLAC.

### Where do the stems end up?

By default, in `~/Downloads/stemsplit/<jobId>/` with one file per stem. Override per-call with `outputDir` or globally with the `STEMSPLIT_DEFAULT_OUTPUT_DIR` env var.

### Can I use this in a custom MCP client or LangChain agent?

Yes. `stemsplit-mcp` follows the MCP spec exactly. Any client that speaks the stdio transport works. For programmatic Node.js / TypeScript clients, see [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

### What if the job takes longer than the timeout?

Pass `wait: false` to `separate_stems` or `separate_youtube`. You'll get the `jobId` back immediately and can poll later with `get_job` / `get_youtube_job`. Or set a longer `timeoutSeconds` (up to 3600s).

### How do I get an API key?

Sign up at [stemsplit.io](https://stemsplit.io) and generate a key at [stemsplit.io/app/settings/api](https://stemsplit.io/app/settings/api). The key format is `sk_live_...`.

---

## License

MIT (c) 2026 StemSplit

---

## Related projects

- [**StemSplit**](https://stemsplit.io) — hosted stem separation web app and API
- [**StemSplit API docs**](https://stemsplit.io/docs/api) — full REST reference + OpenAPI spec
- [**n8n-nodes-stemsplit**](https://www.npmjs.com/package/n8n-nodes-stemsplit) — n8n community node for stem separation workflows
- [**stemsplit-python**](https://pypi.org/project/stemsplit-python/) — Python SDK for the StemSplit API
- [**stemsplit CLI**](https://github.com/StemSplit/stemsplit-cli) — command-line tool (Go), available via Homebrew
- [**demucs-onnx**](https://github.com/StemSplit/demucs-onnx) — ONNX export of HTDemucs for local inference
- [**Model Context Protocol**](https://modelcontextprotocol.io) — the open protocol this server implements

---

## Keywords

stem separation MCP, vocal remover MCP, karaoke generator MCP, Claude Desktop audio, Cursor audio tools, instrumental extractor, acapella extractor, AI stem splitter, MCP audio server, remove vocals from MP3, isolate vocals, split audio into stems, YouTube vocal remover, HTDemucs MCP, Demucs MCP, MCP server for stem separation.
