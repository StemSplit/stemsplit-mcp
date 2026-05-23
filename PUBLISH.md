# stemsplit-mcp publishing

**npm package:** `stemsplit-mcp`
**GitHub repo:** https://github.com/StemSplit/stemsplit-mcp (this folder has its own git repo, separate from the musicai monorepo)
**npm page:** https://www.npmjs.com/package/stemsplit-mcp

## Publishing

Publishing is handled by GitHub Actions with npm provenance.

To release a new version:

1. Bump `version` in `package.json`
2. Update README/changelog if needed
3. Commit and push to `main` of `StemSplit/stemsplit-mcp` (NOT the musicai monorepo)
4. Create a GitHub release:

   ```bash
   gh release create vX.Y.Z \
     --repo StemSplit/stemsplit-mcp \
     --title "vX.Y.Z" \
     --notes "Release notes here"
   ```

5. CI runs typecheck, lint, tests, build, then `npm publish --access public --provenance`.

The `NPM_TOKEN` secret is configured on the `StemSplit/stemsplit-mcp` repo.

## Pre-release checks (local)

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build

# Sanity-check the built server over stdio:
STEMSPLIT_API_KEY=sk_live_... \
  npx @modelcontextprotocol/inspector node dist/index.js
```

The inspector should show:

- 8 tools (`separate_stems`, `separate_youtube`, `get_job`, `list_jobs`, `get_youtube_job`, `list_youtube_jobs`, `get_balance`, `download_stems`)
- 2 static resources (`stemsplit://balance`, `stemsplit://jobs/recent`)
- 2 resource templates (`stemsplit://jobs/{jobId}`, `stemsplit://youtube-jobs/{jobId}`)
- 4 prompts (`karaoke`, `isolate_dialogue`, `sampler_pack`, `youtube_instrumental`)

## Important notes

- This folder has its own `.git`. Pushes go to `git@github.com:StemSplit/stemsplit-mcp.git`, **not** the musicai monorepo.
- Never `npm publish` locally — provenance attestation requires CI.
- After every release, post the new version to:
  - [Smithery](https://smithery.ai)
  - [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers) community list
  - [`punkpeye/awesome-mcp-servers`](https://github.com/punkpeye/awesome-mcp-servers)

## Notes for future maintainers

- The StemSplit API's YouTube endpoints (`POST /api/v1/youtube-jobs`, etc.) are not currently in the public OpenAPI spec at `apps/web/app/api/v1/openapi.json`. The MCP wraps them anyway because they are stable and frequently requested. Consider adding them to the OpenAPI artifact in a separate PR.
- Presigned download URLs from `GET /jobs/:id` and `GET /youtube-jobs/:id` are valid for 1 hour and regenerated on every GET — the `download_stems` tool always re-fetches the job first so expiry is never an issue.
- `metadata` on `POST /jobs` is echo-only and **not** persisted. If you ever need to track per-job client metadata, store it locally keyed by `job.id`.
