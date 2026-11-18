"""Pack lesson data, teaching notes and past papers into data/bundle.js so index.html works straight from disk.

Notes live in notes/*.md as `## <lesson-id>` sections written in a small Markdown subset
(### headings, paragraphs, - and 1. lists with 2-space nesting, | tables |, > callouts, **bold**, *italic*).
"""
import html, json, pathlib, re

APP = pathlib.Path(__file__).parent
P = APP / 'data'
load = lambda n: json.loads((P / n).read_text(encoding='utf8'))


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    return s


def md(text):
    lines, out, i = text.split('\n'), [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
        elif ln.startswith('### '):
            out.append(f'<h3>{inline(ln[4:].strip())}</h3>'); i += 1
        elif ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|[\s\-:|]+\|\s*$', lines[i]):
                    rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            head, body = rows[0], rows[1:]
            out.append('<div class="table-scroll"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) +
                       '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body) +
                       '</tbody></table></div>')
        elif ln.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i][1:].strip()); i += 1
            out.append(f'<div class="callout">{inline(" ".join(buf))}</div>')
        elif re.match(r'^\s*(-|\d+\.)\s', ln):
            items = []  # (indent, ordered, text)
            while i < len(lines) and re.match(r'^\s*(-|\d+\.)\s', lines[i]):
                m = re.match(r'^(\s*)(-|\d+\.)\s+(.*)$', lines[i])
                items.append((len(m.group(1)) // 2, m.group(2) != '-', m.group(3))); i += 1
            out.append(render_list(items))
        else:
            buf = []
            while i < len(lines) and lines[i].strip() and not re.match(r'^(###\s|\||>|\s*(-|\d+\.)\s)', lines[i]):
                buf.append(lines[i].strip()); i += 1
            # keep question sub-parts such as "i) ... ii) ..." on their own lines
            html_ = ''
            for k, b in enumerate(buf):
                html_ += ('<br>' if k and re.match(r'^[ivx]+\)', b) else (' ' if k else '')) + inline(b)
            out.append(f'<p>{html_}</p>')
    return '\n'.join(out)


def render_list(items, level=0, start=0):
    tag = 'ol' if items[start][1] else 'ul'
    html_, j = [f'<{tag}>'], start
    while j < len(items) and items[j][0] >= level:
        if items[j][0] > level:
            sub, j = render_sub(items, j, items[j][0])
            html_[-1] = html_[-1][:-5] + sub + '</li>'
            continue
        html_.append(f'<li>{inline(items[j][2])}</li>'); j += 1
    html_.append(f'</{tag}>')
    return ''.join(html_) if level == 0 else (''.join(html_), j)


def render_sub(items, j, level):
    tag = 'ol' if items[j][1] else 'ul'
    parts = [f'<{tag}>']
    while j < len(items) and items[j][0] >= level:
        if items[j][0] > level:
            sub, j = render_sub(items, j, items[j][0])
            parts[-1] = parts[-1][:-5] + sub + '</li>'
            continue
        parts.append(f'<li>{inline(items[j][2])}</li>'); j += 1
    parts.append(f'</{tag}>')
    return ''.join(parts), j


notes = {}
for f in sorted((APP / 'notes').glob('*.md')):
    for chunk in re.split(r'^## ', f.read_text(encoding='utf8'), flags=re.M)[1:]:
        lid, _, body = chunk.partition('\n')
        notes[lid.strip()] = md(body)

# Predicted papers: predicted/*.md -> "# <id> | <title> | <subtitle>" then "## <slot> | <marks> | <module> | <lesson+lesson>"
# Each question's body is split at "### Model answer" into the question and its answer key.
predicted = []
for f in sorted((APP / 'predicted').glob('*.md')):
    head, *qs = re.split(r'^## ', f.read_text(encoding='utf8'), flags=re.M)
    pid, title, sub = [x.strip() for x in re.search(r'^# (.+)$', head, re.M).group(1).split('|')]
    paper = {'id': pid, 'title': title, 'subtitle': sub, 'questions': []}
    for chunk in qs:
        line, _, body = chunk.partition('\n')
        slot, marks, mod, topics = [x.strip() for x in line.split('|')]
        q, _, a = body.partition('### Model answer')
        assert a.strip(), f'{f.name} {slot}: missing model answer'
        paper['questions'].append({'slot': slot, 'marks': int(marks), 'module': mod, 'topics': topics.split('+'),
                                   'q': md(q.strip()), 'a': md(a.strip())})
    assert sum(x['marks'] for x in paper['questions']) == 50, f'{f.name} does not total 50 marks'
    predicted.append(paper)

sources = load('sources.json')
for d in sources:  # trim whitespace noise to keep the bundle small
    for p in d['pages']:
        p['text'] = ' '.join(p['text'].split())
cur = load('curriculum.json')
missing = [l['id'] for l in cur['lessons'] if l['id'] not in notes]
assert not missing, f'lessons without notes: {missing}'
bundle = {'curriculum': cur, 'questions': load('questions.json'), 'notes': notes, 'predicted': predicted, 'sources': sources}
bad = [t for pp in predicted for x in pp['questions'] for t in x['topics'] if t not in {l['id'] for l in cur['lessons']}]
assert not bad, f'unknown lesson ids in predicted papers: {bad}'
text = json.dumps(bundle, ensure_ascii=False).replace('—', ' - ')  # no em dashes anywhere in the app
(P / 'bundle.js').write_text('window.EOM=' + text + ';', encoding='utf8')
print('bundle.js', round((P / 'bundle.js').stat().st_size / 1024), 'KB;', len(notes), 'lesson notes')
