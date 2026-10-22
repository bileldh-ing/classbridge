# ClassBridge demo film (Remotion)

A JavaScript-Mastery-style product tour built from the Playwright demo recordings.

1. **Record scenes**: run the *Demo video* workflow (`demo-video.yml`, input `pause_ms`, 3000 recommended). It records
   17 scenes (`e2e/demo-tour*.spec.ts`) into the `demo-scenes` artifact.
2. **Render**: run the *Render video* workflow (`render-video.yml`) with `scenes_run_id` = that run's id. It converts the
   scenes (`scripts/prepare.mjs`), fetches real successful runs for the CI/CD segment, synthesises the royalty-free music
   bed (`scripts/make-music.py`), renders 1080p30 H.264/AAC with Remotion and a 720p copy, and uploads both as the
   `classbridge-demo-mp4` artifact (about 30 min on `ubuntu-latest`).

Locally (x86 with Chrome available): `npm install`, `SCENES_DIR=../demo-scenes node scripts/prepare.mjs`,
`python3 scripts/make-music.py 540`, then `npm run studio` or `npm run render`.

Structure: `src/config.ts` (chapters, captions, camera moves), `src/timeline.ts` (durations from the recordings,
transition plan), `src/segments/*` (intro, tech stack, chapter cards, browser/phone clips, pipeline, real runs,
architecture, outro), `src/components/*` (background, mockups, lower third, camera).
