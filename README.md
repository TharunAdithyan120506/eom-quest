# EOM Quest

A self-contained, gamified study app for **HUM 3022 Essentials of Management**: all five modules, the SDL Quality Management units, and the eight end-semester papers (Nov 2024 to Jun 2026).

## What's inside
- **83 lessons** in syllabus order, each with full teaching notes, a visual summary, a memory hook, an exam trap, an active-recall question and the past-paper questions on that topic.
- **Paper analysis**: module and topic weightage, the question-number pattern and the command words examiners use.
- **Past papers**: all 120 questions as the original images, with guidance on how to answer.
- **Mock exam**: sit any paper and self-mark; drafts are saved.
- **Recall arena** (flashcards), **cram sheet**, **battle plan** and a **PDF library** of every slide page.
- **Profiles**: each person's progress (XP, lessons, cards, mocks) is saved in their browser, with export/import to move it between devices.

## Run it
Open `index.html` in any browser. No server, build step or internet needed.

Or serve the folder: `python -m http.server 8765` and visit http://localhost:8765.

## Deploy
It is a static site: the repository root is the site root.
- **Vercel**: import the repo, framework preset "Other", no build command, output directory `.` (`vercel.json` adds caching headers).
- **GitHub Pages**: Settings → Pages → deploy from the `main` branch, root folder.

## Project layout
| Path | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app (vanilla JS, hash routing) |
| `data/bundle.js` | Generated: all content packed for `file://` use |
| `notes/*.md` | Teaching notes, one `## <lesson-id>` section per lesson |
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
