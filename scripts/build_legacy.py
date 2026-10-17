"""Build the separate Legacy dataset. Uses only Python's standard library.

Run: python3 scripts/build_legacy.py ~/gymdata
The original text is authoritative; review flags are deliberately conservative.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
HEADER = re.compile(r"^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(.*))?$")
NUMBER = r"[+-]?\d+(?:\.\d+)?"
WEIGHT = re.compile(r"\(([^()]*)\)|\[(-\d+(?:\.\d+)?)\]")
REP = re.compile(r"(\d+)(?:\+(\d+))?([✓#?❤️]*(?:(?:fd|mm|d|c|h|f)[✓#?]*)?)(?=\s|$|[([])")
# These are separate workouts without headings, identified during source review.
# Line checks below guard the source-specific rules; the hash records provenance.
UNDATED_STARTS = {2044: 'Bp (52.5)', 2056: 'Bp (42.5)', 2069: 'Idbp 30', 3542: 'Bc (10)'}
EXCLUDED_LINES = {26: 'Ote (12.5 other tower)', 27: 'Fp(12.5 same)'}
# The last September workout in the source is September 25; the preceding one
# is September 21. Neither has an Mr entry affected by this boundary choice.
JAPAN_START, JAPAN_END = '2024-09-25', '2025-03-31'
BAR = {'Pc', 'Rc', 'Jmp', 'Sk'}
BODYWEIGHT = {'Pu', 'Pu wg', 'Pu ng', 'Pu rings', 'Dips', 'Bodyweight squat', 'Hanging leg raise', 'Crunches'}
NAMES = {
    'bp': 'Bench press', 'bp p': 'Paused bench press',
    'ibbp': 'Incline barbell bench press', 'ohp': 'Barbell overhead press',
    'mr': 'Machine row', 'mr partial': 'Machine row (partial)', 'cp': 'Chest press',
    'dbr': 'Dumbbell row', 'br': 'Br', 'be': 'Back extension',
    'sq ssb': 'Safety-bar squat', 'ssb sq': 'Safety-bar squat',
    'sq ssb p': 'Paused safety-bar squat', 'sq ssbp': 'Paused safety-bar squat',
    'sq (ssb)': 'Safety-bar squat',
    'sq': 'Squat', 'sq high bar': 'High-bar squat',
    'sm sq': 'Smith squat', 'sq sm': 'Smith squat', 'smith sq': 'Smith squat',
    'bssq': 'Bulgarian split squat', 'rdl': 'Romanian deadlift',
    'db rdl': 'Dumbbell Romanian deadlift', 'db drl': 'Dumbbell Romanian deadlift',
    'stdl': 'Stiff-leg deadlift', 'stdl from floor': 'Stiff-leg deadlift from floor',
    'pu': 'Pu', 'pu wg': 'Pu wg', 'pu ng': 'Pu ng', 'pu ng h': 'Pu ng', 'pu rings': 'Pu rings',
    'pd wg': 'Wide-grip pulldown', 'lp wg': 'Wide-grip pulldown',
    'pd ng': 'Narrow-grip pulldown', 'pd mg n': 'Medium-width neutral-grip pulldown',
    'pd m ng': 'Medium-width neutral-grip pulldown',
    'd': 'Dips', 'dips': 'Dips', 'lp': 'Leg press', 'leg press': 'Leg press',
    'lc': 'Leg curl', 'le': 'Leg extension', 'ca': 'Calf raises on leg press',
    'ca lp': 'Calf raises on leg press', 'abd': 'Abductor machine',
    'abd m': 'Abductor machine', 'add': 'Adductor machine',
    'bc': 'Bc 60', 'hc': 'Hammer curl', 'pc': 'Pc', 'rc': 'Rc', 'rgc': 'Rc',
    'jmp': 'Jmp', 'sk': 'Sk', 'sk db': 'Dumbbell skull crushers',
    'ote': 'Overhead triceps extension', 'tpd': 'Triceps pushdown',
    'fp': 'Face pull', 'rf': 'Reverse fly', 'rcf': 'Reverse cable fly',
    'lr': 'Lr 60', 'db lr': 'Lr 60', 'lr db': 'Lr 60',
    'clr': 'Cable lateral raise', 'lur': 'Lu raise', 'yr': 'Y raise', 'lrm': 'Machine lateral raise',
    'ur': 'Upright row', 'abs': 'Crunches', 'crunches': 'Crunches',
    'hlr': 'Hanging leg raise', 'bodyweight sq': 'Bodyweight squat',
    'scc': 'Suitcase carry', 'suitcase': 'Suitcase carry',
}
# Preserve unresolved exercise identities, rather than merge unlike equipment.
UNRESOLVED = {'high row': 'High row', 'hammer row machine': 'Hammer row machine',
              'hammer chest press machine': 'Hammer chest press machine',
              'partial dip machine': 'Partial dip machine', 'bayesian curl': 'Bayesian curl',
              'pd': 'Pd', 'pc one handed': 'Pc one handed',
              'sk or jm press at this point rather': 'Sk / JM press (uncertain)'}


def identify(text, line):
    lower = text.lower()
    if lower.startswith('lr m trying out'):
        return None, '', 'ignored: Lr m, as requested'
    if line == 2979 and lower == 'idbp':
        return None, '', 'ignored: Japanese-gym entry without sets, as requested'
    if line in (2072, 2833):
        return f'Idp {75 if line == 2072 else 30}', text[4:].strip(), None
    match = re.match(r'(?:idbp|idp)\s+(30|45|60|75)\b', lower)
    if match:
        return f'Idp {match[1]}', text[match.end():].strip(), None
    # Bc angles collapse to 60; all numeric dumbbell lateral-raise variants to 60.
    match = re.match(r'(bc|lr|db lr|lr db)\s+(\d+)\b', lower)
    if match:
        return ('Bc 60' if match[1] == 'bc' else 'Lr 60'), text[match.end():].strip(), None
    if lower.startswith('bc (60)'):
        return 'Bc 60', text[len('bc (60)'):].strip(), None
    for alias in sorted(NAMES | UNRESOLVED, key=len, reverse=True):
        if lower.startswith(alias) and (len(lower) == len(alias) or lower[len(alias)] in ' ([0123456789'):
            return (NAMES | UNRESOLVED)[alias], text[len(alias):].strip(), ('exercise identity needs review' if alias in UNRESOLVED else None)
    return None, '', 'unparsed note or exercise'


def parse_sets(payload, name):
    """Read only explicit weights and adjacent reps; never extract numbers from prose."""
    sets, issues, comments = [], [], []
    weight = 0.0 if name in BODYWEIGHT else None
    position = 0
    while position < len(payload):
        rest = payload[position:]
        if rest[0].isspace():
            position += 1
            continue
        suffix = re.match(r'(?:mm|fd|d|c|h)\b', rest)
        if suffix:
            position += suffix.end()
            continue
        match = WEIGHT.match(payload, position)
        if match:
            value = match[1] if match[1] is not None else match[2]
            # Parenthesized equipment notes can follow an explicit weight.
            number = re.match(rf'^\s*({NUMBER})(?:\s*\+\s*({NUMBER}))?(.*)$', value)
            if not number:
                comments.append(match[0])
            elif number[3].strip():
                weight = float(number[2] or number[1]) + (10 if name in BAR else 0)
                comments.append(number[3].strip())
            else:
                weight = float(number[2] or number[1]) + (10 if name in BAR else 0)
            position = match.end()
            continue
        match = REP.match(payload, position)
        if match:
            # An alternative count is not two sets ("9 or 8 idk 7").
            if re.match(r'\s+or\b', payload[match.end():]):
                issues.append('ambiguous rep alternatives: ' + rest)
                comments.append(rest)
                break
            if match[2] and name not in {'Bench press', 'Paused bench press'}:
                issues.append('unconfirmed rep-plus notation: ' + rest)
                comments.append(rest)
                break
            reps = int(match[1])
            if reps < 1:
                issues.append('nonpositive rep count: ' + rest)
                comments.append(rest)
                break
            sets.append({'position': len(sets), 'weight_kg': weight, 'reps': reps,
                         'new_weight_marker': '#' in match[3], 'raw': match[0]})
            position = match.end()
            continue
        # Stop at prose; later numbers might describe pain, seats, angles, etc.
        # A later explicit weight starts another safely interpretable group.
        next_weight = WEIGHT.search(payload, position + 1)
        end = next_weight.start() if next_weight else len(payload)
        note = payload[position:end].strip()
        if note:
            comments.append(note)
            if re.search(r'\d', note):
                issues.append('numbers within comment need review: ' + note)
        position = end
    return sets, issues, '\n'.join(comments)


def build(source):
    raw = source.read_bytes()
    lines = raw.decode('utf-8').splitlines()
    for line, prefix in UNDATED_STARTS.items():
        if not lines[line - 1].startswith(prefix):
            raise ValueError(f'Source layout changed at line {line}; review line-specific rules first')
    for line, prefix in EXCLUDED_LINES.items():
        if not lines[line - 1].strip().startswith(prefix):
            raise ValueError(f'Source tracking exclusion moved at line {line}; review rules first')
    if lines[2702].strip() != '12.01':
        raise ValueError('Source date correction moved; review rules first')
    for line, expected in {2072: 'Idbp (12.5)', 2833: 'Idbp (16)'}.items():
        if not lines[line - 1].startswith(expected):
            raise ValueError(f'Source angle correction moved at line {line}; review rules first')
    sessions, entries, review = [], [], []
    year, previous, current = 2026, None, None
    for line, raw_line in enumerate(lines, 1):
        text = raw_line.strip()
        header = HEADER.fullmatch(text)
        if header or line in UNDATED_STARTS:
            if header:
                day, month = int(header[1]), int(header[2])
                if line == 2703:
                    day, month = 1, 12
                if header[3]:
                    year = int(header[3]) + (2000 if len(header[3]) == 2 else 0)
                elif previous and month - previous.month > 6:
                    year -= 1
                date = dt.date(year, month, day)
                if previous and date > previous:
                    review.append({'line': line, 'reason': 'dated headings out of order', 'raw': text})
                previous = date
                current = {'id': len(sessions) + 1, 'date': date.isoformat(),
                           'date_status': 'corrected' if line == 2703 else 'year_inferred' if not header[3] else 'explicit',
                           'date_lower_bound': date.isoformat(), 'date_upper_bound': date.isoformat(),
                           'source_line': line, 'heading': text, 'note': header[4] or ''}
            else:
                current = {'id': len(sessions) + 1, 'date': None, 'date_status': 'estimated',
                           'date_lower_bound': None, 'date_upper_bound': None,
                           'source_line': line, 'heading': None, 'note': 'Undated block; session boundary inferred from blank lines and exercise sequence.'}
            sessions.append(current)
            if header:
                entries.append({'line': line, 'session_id': current['id'], 'raw': raw_line,
                                'exercise': None, 'sets': [], 'issues': [], 'status': 'heading',
                                'comment': current['note'], 'exclude_from_tracking': False})
                continue
        if not text:
            continue
        name, payload, issue = identify(text, line)
        sets, issues, comment = parse_sets(payload, name) if name else ([], [], text)
        if issue:
            issues.insert(0, issue)
        if name and not sets:
            issues.append('no safely parsed completed sets')
        entry = {'line': line, 'session_id': current['id'] if current else None,
                 'raw': raw_line, 'exercise': name, 'sets': sets, 'issues': issues,
                 'comment': comment, 'exclude_from_tracking': line in EXCLUDED_LINES,
                 'status': 'ignored' if issue and issue.startswith('ignored:') else 'exercise' if name else 'note'}
        entries.append(entry)
        if issues:
            review.append({'line': line, 'reason': '; '.join(issues), 'raw': raw_line})
    # Interpolate the three undated June blocks; exact dates remain explicitly unknown.
    for index, session in enumerate(sessions):
        if session['date']:
            continue
        newer = next((s for s in reversed(sessions[:index]) if s['date_status'] != 'estimated'), None)
        older = next((s for s in sessions[index + 1:] if s['date_status'] != 'estimated'), None)
        upper = dt.date.fromisoformat(newer['date']) if newer else None
        lower = dt.date.fromisoformat(older['date']) if older else None
        if upper and lower:
            group = [s for s in sessions if s['date_status'] == 'estimated' and newer['source_line'] < s['source_line'] < older['source_line']]
            step = group.index(session) + 1
            estimate = upper - dt.timedelta(days=round((upper - lower).days * step / (len(group) + 1)))
        else:
            estimate = upper - dt.timedelta(days=1) if upper else lower + dt.timedelta(days=1)
        session.update(date=estimate.isoformat(), date_lower_bound=lower.isoformat() if lower else None,
                       date_upper_bound=upper.isoformat() if upper else None)
        review.append({'line': session['source_line'], 'reason': f'Estimated workout date {session["date"]}; bounds {session["date_lower_bound"]} to {session["date_upper_bound"]}', 'raw': session['note']})
    session_dates = {s['id']: s['date'] for s in sessions}
    for entry in entries:
        date = session_dates.get(entry['session_id'])
        if entry['exercise'] == 'Machine row' and date and JAPAN_START <= date <= JAPAN_END:
            entry['exercise'] = 'Machine row (partial)'
    # Lukas approved estimated dates and requested deletion of all other flagged
    # entries, including any partially parsed sets belonging to those entries.
    removed_lines = [entry['line'] for entry in entries if entry['issues']]
    entries = [entry for entry in entries if not entry['issues']]
    review = []
    exercises = sorted({e['exercise'] for e in entries if e['exercise'] and e['sets']})
    return {'dataset': 'Legacy', 'format_version': 2, 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'source_text': raw.decode('utf-8'), 'exercises': exercises, 'sessions': sessions,
            'entries': entries, 'review': review, 'removed_source_lines': removed_lines}


def write_database(path, data):
    # Rebuilding this generated artifact never opens the live app database.
    connection = sqlite3.connect(path)
    connection.execute('PRAGMA foreign_keys = ON')
    try:
        with connection:
            for table in ('legacy_sets', 'legacy_entries', 'legacy_exercises', 'legacy_sessions', 'legacy_metadata'):
                connection.execute(f'DROP TABLE IF EXISTS {table}')
            connection.executescript('''
                CREATE TABLE legacy_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE legacy_sessions (id INTEGER PRIMARY KEY, date TEXT NOT NULL, date_status TEXT NOT NULL,
                    date_lower_bound TEXT, date_upper_bound TEXT, source_line INTEGER NOT NULL, heading TEXT, note TEXT NOT NULL);
                CREATE TABLE legacy_exercises (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
                CREATE TABLE legacy_entries (id INTEGER PRIMARY KEY, session_id INTEGER REFERENCES legacy_sessions(id),
                    exercise_id INTEGER REFERENCES legacy_exercises(id), source_line INTEGER NOT NULL UNIQUE,
                    raw_text TEXT NOT NULL, status TEXT NOT NULL, issues_json TEXT NOT NULL,
                    comment TEXT NOT NULL, exclude_from_tracking INTEGER NOT NULL CHECK(exclude_from_tracking IN (0,1)));
                CREATE TABLE legacy_sets (id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES legacy_entries(id),
                    position INTEGER NOT NULL, weight_kg REAL, reps INTEGER NOT NULL CHECK(reps > 0),
                    new_weight_marker INTEGER NOT NULL CHECK(new_weight_marker IN (0,1)), raw_text TEXT NOT NULL,
                    UNIQUE(entry_id, position));
            ''')
            connection.executemany('INSERT INTO legacy_metadata VALUES (?, ?)',
                                   [(key, str(data[key])) for key in ('dataset', 'format_version', 'source_sha256', 'source_text')])
            connection.execute('INSERT INTO legacy_metadata VALUES (?, ?)',
                               ('removed_source_lines', json.dumps(data['removed_source_lines'])))
            connection.executemany('INSERT INTO legacy_sessions VALUES (:id,:date,:date_status,:date_lower_bound,:date_upper_bound,:source_line,:heading,:note)', data['sessions'])
            ids = {name: index for index, name in enumerate(data['exercises'], 1)}
            connection.executemany('INSERT INTO legacy_exercises VALUES (?, ?)', [(i, name) for name, i in ids.items()])
            for entry in data['entries']:
                result = connection.execute('INSERT INTO legacy_entries(session_id,exercise_id,source_line,raw_text,status,issues_json,comment,exclude_from_tracking) VALUES (?,?,?,?,?,?,?,?)',
                                            (entry['session_id'], ids.get(entry['exercise']), entry['line'], entry['raw'], entry['status'], json.dumps(entry['issues']), entry['comment'], int(entry['exclude_from_tracking'])))
                connection.executemany('INSERT INTO legacy_sets(entry_id,position,weight_kg,reps,new_weight_marker,raw_text) VALUES (?,?,?,?,?,?)',
                                       [(result.lastrowid, s['position'], s['weight_kg'], s['reps'], int(s['new_weight_marker']), s['raw']) for s in entry['sets']])
        assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not connection.execute('PRAGMA foreign_key_check').fetchall()
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    data = build(args.source.expanduser())
    output = ROOT / 'data' / 'legacy'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'legacy.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    write_database(output / 'legacy.sqlite', data)
    # Bundle only importable performance data in Metro's project root. The full
    # source/audit copy stays in data/legacy rather than inflating the app bundle.
    app_sessions = []
    for session in data['sessions']:
        entries = [entry for entry in data['entries'] if entry['session_id'] == session['id'] and entry['sets']]
        if entries:
            app_sessions.append({**session, 'entries': [
                {key: entry[key] for key in ('line', 'exercise', 'comment', 'exclude_from_tracking', 'sets')}
                for entry in entries]})
    app_data = {'dataset': data['dataset'], 'source_sha256': data['source_sha256'], 'sessions': app_sessions}
    app_output = ROOT / 'mobile' / 'data'
    app_output.mkdir(exist_ok=True)
    (app_output / 'legacy.json').write_text(json.dumps(app_data, ensure_ascii=False, separators=(',', ':')) + '\n')
    counts = {name: sum(len(e['sets']) for e in data['entries'] if e['exercise'] == name) for name in data['exercises']}
    report = ['# Legacy conversion review', '',
              'Generated by `python3 scripts/build_legacy.py ~/gymdata`. Source text is embedded in both artifacts.', '',
              f"{len(data['sessions'])} session blocks; {len(counts)} exercises; {sum(counts.values())} parsed sets.", '',
              'Estimated dates are not exact workout dates. Unknown weights are NULL; dumbbell weights are per dumbbell.',
              'PR improvements are not inferred from check marks. No live app data has been changed.', '',
              'Trailing text is stored as comments. Source entries 26–27 are included but excluded from tracking.',
              'Machine rows from late September 2024 through March 2025 are Machine row (partial).', '',
              f"All {len(data['removed_source_lines'])} other flagged source entries were removed, including their sets, as requested.",
              'The four estimated dates are accepted; date provenance and bounds remain stored.', '',
              '## Exercise inventory', '', '| Exercise | Parsed sets |', '| --- | ---: |']
    report += [f'| {name} | {count} |' for name, count in counts.items()]
    report += ['', '## Entries needing review', '', '| Source line | Reason | Original entry |', '| ---: | --- | --- |']
    report += [f'| {r["line"]} | {r["reason"].replace("|", "/")} | {r["raw"].strip().replace("|", "/")} |' for r in data['review']]
    (output / 'review.md').write_text('\n'.join(report) + '\n')
    print(f"Built Legacy: {len(data['sessions'])} session blocks, {len(counts)} exercises, {sum(counts.values())} sets; {len(data['review'])} review flags.")


if __name__ == '__main__':
    main()
