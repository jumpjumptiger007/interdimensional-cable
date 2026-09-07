# InterDemTV by Adrian

A non-commercial personal experiment: a single-screen retro television and physical remote that tune through YouTube video IDs. Videos remain hosted by YouTube and belong to their respective owners.

## Run locally

Serve this directory with any static web server, for example `python3 -m http.server`, then open the shown local URL. The YouTube player is requested only after the receiver is powered on.

## Controls

Use the remote for power, channel, volume, mute, RND/SEQ, fullscreen, favorites, and permanent local skip. Desktop keyboard controls are Arrow Up/Down for channels, Arrow Left/Right for volume, Space for power, M for mute, and F for fullscreen. Settings, favorites, skips, and the last usable channel are stored only in the browser's local storage.

`RND` preserves the original behavior: the channel list is shuffled on load, and unseen long videos can begin at one random position. `SEQ` starts unseen videos normally.

## Content refresh and validation

The daily GitHub Actions workflow discovers candidate YouTube IDs, then runs `scripts/validate_videos.py`. Configure a repository secret named `YOUTUBE_API_KEY` to check public availability and embeddability in batches using the YouTube Data API. Without that secret, the workflow still runs and removes duplicates/invalid-shaped IDs; runtime recovery skips unavailable videos for the current session.

This is a static GitHub Pages-compatible project with no accounts, tracking, or media rehosting.
