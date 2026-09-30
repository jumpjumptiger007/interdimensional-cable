# Repository Instructions

## Project shape

- InterDemTV is a static browser app hosted on GitHub Pages. See `README.md` for its features and user-facing behavior.
- Preserve the vanilla HTML, CSS, and JavaScript architecture and the no-build setup. Do not add a framework, bundler, or server dependency unless the task calls for it.
- Main boundaries are `index.html` for markup, `app.js` for app behavior, `style.css` for presentation, and `environment-3d.js` for the optional WebGL scene. Preserve CSS fallbacks when WebGL is unavailable and the existing responsive layout.
- `CNAME` configures the published domain. Treat it as deployment configuration and leave it unchanged for unrelated work.

## Channel data and automation

- `videos.json` is the canonical, ordered channel list. Its order affects sequential navigation; preserve existing IDs and order unless the task explicitly changes the lineup.
- `scripts/fetch_reddit.py` appends discovered IDs to `videos.json`. `scripts/validate_videos.py` rewrites it to remove malformed or duplicate IDs and, when `YOUTUBE_API_KEY` is set, unavailable or non-embeddable videos. These scripts modify project data; do not run them as generic checks.
- `.github/workflows/update-videos.yml` runs the channel update on a schedule or by manual dispatch and may commit changes to `videos.json`. Review data changes before accepting them.
- Keep `YOUTUBE_API_KEY` in GitHub Actions secrets or the local environment; never add credentials to repository files.

## Runtime and validation

- Keep cache-busting versions in `index.html` synchronized with the corresponding entries in `service-worker.js`. When changing cached static assets in a way that must reach existing clients, update the cache/versioning deliberately and verify both online loading and offline fallback.
- There is no package, build, or automated test configuration in the repository. For a read-only channel-data syntax check, use `python3 -c "import json; json.load(open('videos.json'))"`.
- For browser changes, serve the repository with `python3 -m http.server` and smoke-test the affected behavior in a browser.

## Git workflow

- Preserve unrelated working-tree changes and keep commits focused.
- Do not commit, push, merge, create a pull request, tag, or release unless the task explicitly authorizes it.
- When Git actions are authorized, use the branch/workflow requested by the task or already established for that work; do not create or switch branches unnecessarily.
