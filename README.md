# EOM Quest

A self-contained, gamified study app for **HUM 3022 Essentials of Management**: all five modules, the SDL Quality Management units, and the eight end-semester papers (Nov 2024 to Jun 2026).

## What's inside
- **83 lessons** in syllabus order, each with full teaching notes, a visual summary, a memory hook, an exam trap, an active-recall question and the past-paper questions on that topic.
- **Paper analysis**: module and topic weightage, the question-number pattern and the command words examiners use.
- **Past papers**: all 120 questions as the original images, with guidance on how to answer.
- **Predicted papers**: two full 50-mark papers built from the slot-by-slot past-paper pattern, with model answers.
- **Mock exam**: sit any paper and self-mark; drafts are saved.
- **Recall arena** (flashcards), **cram sheet**, **battle plan** and a **PDF library** of every slide page.
- **Bookmarks**: star any lesson or past-paper question to revise later, as flash cards or a filtered cram sheet.
- **Leaderboard**: opt-in ranking by XP, lessons, past papers and best mock (online version).
- **Profiles**: each person's progress (XP, lessons, cards, mocks) is saved in their browser, with encrypted, tamper-checked export/import (`.eomq`) to move it between devices.

## Run it
Open `index.html` in any browser. No server, build step or internet needed.

Or serve the folder: `python -m http.server 8765` and visit http://localhost:8765.

## Deploy
It is a static site: the repository root is the site root.
- **Vercel**: import the repo, framework preset "Other", no build command, output directory `.` (`vercel.json` adds caching headers).
- **GitHub Pages**: Settings → Pages → deploy from the `main` branch, root folder. (The leaderboard needs Vercel.)

## Leaderboard
An opt-in leaderboard runs on a Vercel function (`api/leaderboard.js`) backed by Upstash Redis. To switch it on:
1. In the Vercel project, open **Storage** → **Create Database** → **Upstash for Redis** (free plan) and connect it to this project.
2. Redeploy. The function reads `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) automatically.

Players join from the Leaderboard page; each gets a secret token so nobody else can overwrite their row. The server rejects impossible numbers, XP that grows faster than the app can award it, and more than one update every 5 seconds. Scores are still reported by the browser, so treat it as a friendly board, not a secure one. Opened from disk (`file://`) the page just shows that the leaderboard needs the online version.

## Project layout
| Path | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app (vanilla JS, hash routing) |
| `api/leaderboard.js` | Vercel function for the leaderboard (Upstash Redis) |
| `data/bundle.js` | Generated: all content packed for `file://` use |
| `notes/*.md` | Teaching notes, one `## <lesson-id>` section per lesson |
| `predicted/*.md` | Predicted papers: one `##` header per question (slot, marks, module, lessons, separated by pipes), then the question and a `### Model answer` |
| `curriculum.py` | Lesson list, recall questions, memory hooks |
| `assets/pages/`, `assets/questions/` | Rendered slide pages and past-paper question crops |

## Rebuilding content
Only needed if lesson content changes. The source PDFs sit one folder up and are not part of this repo.
```
python build_sources.py   # renders PDF pages and crops each past-paper question (needs the PDFs)
python curriculum.py      # writes data/curriculum.json
python enrich.py          # maps past-paper questions to lessons
python build_bundle.py    # packs everything (including notes/*.md) into data/bundle.js
```

## Note on content
The slides, SDL material and question papers belong to the course faculty and university. Keep the repository and deployment private or restricted to your class unless you have permission to publish them.
