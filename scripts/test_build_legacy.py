"""Focused conversion checks: python3 -m unittest discover -s scripts -p 'test_*.py'."""
from pathlib import Path
import tempfile
import sqlite3
import unittest

from build_legacy import build, identify, parse_sets, write_database


class LegacyConversionTests(unittest.TestCase):
    def test_bar_weight_and_assisted_reps(self):
        sets, issues, _ = parse_sets('(9+12.5) 8 (+10) 12', 'Pc')
        self.assertEqual([(s['weight_kg'], s['reps']) for s in sets], [(22.5, 8), (20, 12)])
        self.assertFalse(issues)
        sets, _, _ = parse_sets('(50) 6+1 (45) 5+2', 'Bench press')
        self.assertEqual([s['reps'] for s in sets], [6, 5])

    def test_negative_assistance_and_repeated_weight(self):
        sets, _, _ = parse_sets('6 5 [-7] 5', 'Pu')
        self.assertEqual([(s['weight_kg'], s['reps']) for s in sets], [(0, 6), (0, 5), (-7, 5)])
        sets, _, _ = parse_sets('(12) 10 8', 'Dumbbell row')
        self.assertEqual([s['weight_kg'] for s in sets], [12, 12])

    def test_notes_do_not_become_phantom_sets(self):
        sets, issues, comment = parse_sets('(8) 10 10 height 4 better stretch?', 'Bulgarian split squat')
        self.assertEqual([s['reps'] for s in sets], [10, 10])
        self.assertTrue(issues)
        self.assertEqual(comment, 'height 4 better stretch?')
        sets, issues, _ = parse_sets('9 or 8 idk 7', 'Pu')
        self.assertEqual(sets, [])
        self.assertTrue(issues)

    def test_comments_and_ignored_suffixes(self):
        sets, issues, comment = parse_sets('(12.5 other tower) 15 13 minor pain', 'Overhead triceps extension')
        self.assertEqual([s['reps'] for s in sets], [15, 13])
        self.assertEqual(comment, 'other tower\nminor pain')
        self.assertEqual(issues, [])
        sets, issues, comment = parse_sets('(30) 11mm 9 mm', 'Leg curl')
        self.assertEqual([s['reps'] for s in sets], [11, 9])
        self.assertEqual((issues, comment), ([], ''))

    def test_exercise_distinctions(self):
        self.assertEqual(identify('Idbp 45 (12) 10', 1)[:2], ('Idp 45', '(12) 10'))
        self.assertEqual(identify('Bc 60 (10) 8', 1)[0], 'Bc 60')
        self.assertEqual(identify('Be (10) 8', 1)[0], 'Back extension')
        self.assertEqual(identify('Lrm (10) 8', 1)[0], 'Machine lateral raise')
        self.assertIsNone(identify('Lr m trying out', 1)[0])
        self.assertNotEqual(identify('Bp p (50) 8', 1)[0], identify('Bp (50) 8', 1)[0])
        self.assertEqual(identify('Sk db (5) 12', 1)[0], 'Dumbbell skull crushers')
        self.assertEqual(identify('Pu ng h 8 5', 1)[:2], ('Pu ng', '8 5'))
        self.assertEqual(identify('Cp (50) 10', 1)[0], 'Chest press')

    def test_full_source_and_database_integrity(self):
        # This integration check intentionally uses the actual source being converted.
        source = Path.home() / 'gymdata'
        if not source.exists():
            self.skipTest('Original ~/gymdata is not available')
        data = build(source)
        self.assertEqual(len(data['entries']) + len(data['removed_source_lines']), len([s for s in source.read_text().splitlines() if s.strip()]))
        self.assertTrue(all(not e['issues'] for e in data['entries']))
        self.assertEqual(data['review'], [])
        self.assertIn(2097, data['removed_source_lines'])  # Ambiguous pull-up reps.
        self.assertFalse(any(e['line'] == 2097 for e in data['entries']))
        self.assertEqual(data['source_text'], source.read_text())
        sessions = {s['source_line']: s for s in data['sessions']}
        self.assertEqual(sessions[2703]['date'], '2024-12-01')
        self.assertEqual(sessions[2564]['date'], '2025-01-11')
        self.assertEqual(sessions[6]['date'], '2026-10-16')
        self.assertEqual(sum(s['date_status'] == 'estimated' for s in sessions.values()), 4)
        self.assertTrue(all(s['date_lower_bound'] is None or s['date_lower_bound'] <= s['date'] <= s['date_upper_bound'] for s in sessions.values()))
        self.assertFalse(any('out of order' in r['reason'] for r in data['review']))
        entries = {e['line']: e for e in data['entries']}
        for line in (26, 27):
            self.assertTrue(entries[line]['exclude_from_tracking'])
            self.assertEqual(len(entries[line]['sets']), 2)
            self.assertTrue(entries[line]['comment'])
        self.assertEqual(sum(e['exclude_from_tracking'] for e in data['entries']), 2)
        self.assertEqual(entries[34]['exercise'], 'Pu ng')
        self.assertEqual(entries[34]['sets'][0]['weight_kg'], 0)
        session_dates = {s['id']: s['date'] for s in data['sessions']}
        for entry in data['entries']:
            date = session_dates[entry['session_id']]
            if entry['raw'].strip().lower().startswith('mr ('):
                expected = 'Machine row (partial)' if '2024-09-25' <= date <= '2025-03-31' else 'Machine row'
                self.assertEqual(entry['exercise'], expected)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'legacy.sqlite'
            write_database(path, data)
            # Rebuilding is replacement, not an accumulating/double import.
            write_database(path, data)
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                self.assertEqual(db.execute('SELECT COUNT(*) FROM legacy_sets').fetchone()[0], sum(len(e['sets']) for e in data['entries']))
                self.assertEqual(db.execute('SELECT COUNT(*) FROM legacy_sets s JOIN legacy_entries e ON e.id=s.entry_id WHERE e.exclude_from_tracking=1').fetchone()[0], 4)
                self.assertEqual(db.execute('SELECT comment FROM legacy_entries WHERE source_line=26').fetchone()[0], 'other tower')


if __name__ == '__main__':
    unittest.main()
