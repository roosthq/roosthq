# Learning media + content pipeline (2026-10 overhaul)

Reference copies of the scripts that produced the October 2026 question bank. They were run from a scratch
directory, so every script has absolute paths at the top (`REPO`, `S`/scratchpad, `ROOT`) that you must point at your
own checkout/work dir before running.

- `media_tools.py` - searches Wikimedia Commons and downloads/crops/normalizes free-licensed photos and animal
  sounds (refuses any license that is not public domain, CC0, CC BY or CC BY-SA). `fetch-image --contain` for
  flags/diagrams. Needs `pip install pillow imageio-ffmpeg`.
- `viz.py` - draws the math/logic pictures (clocks, fractions, bar graphs, number lines, area, angles, patterns,
  odd-one-out, matrices) FROM the parameters that define each answer, so the answers cannot be wrong.
- `build-media-questions.js` - turns the animal manifests into Biology photo/sound questions.
- `build-credits.js` - writes `web/public/learning/CREDITS.md` + `manifest.json` from the manifests.
- `merge.js`, `merge-sets.js` - merge reviewed/verified agent output into `prisma/seed-data/edu-sync`.

The reviewed change set itself lives in `prisma/seed-data/edu-sync` and is applied to a database with
`node prisma/tools/edu-sync.js [--apply]` (idempotent, additive, never deletes). `edu-validate.js` is the quality
gate: run it on any new question file before it ships.
