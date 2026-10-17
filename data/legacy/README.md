# Legacy dataset

An additional historical dataset, separate from the app's current SQLite database.
Creating these files does **not** import anything into the app. Settings → Import
Legacy explicitly imports the reviewed data into the current app database once.

- `legacy.sqlite`: SQLite dataset, named `Legacy` in `legacy_metadata`.
- `legacy.json`: portable equivalent, including original source text and review flags.
- `review.md`: exercise inventory and entries requiring interpretation/review.
- `../../scripts/build_legacy.py`: reproducible conversion, using standard-library Python.
- `../../mobile/data/legacy.json`: compact generated payload bundled by Metro.
- `../../mobile/legacyImport.ts`: transactional, duplicate-safe app importer.

## App import

Settings → Import Legacy adds 278 finished workouts and 5,973 sets, labeled Legacy.
Exercises match existing library names case-insensitively (trimmed, oldest ID if
duplicates exist); unmatched names are created. No fuzzy abbreviation matching is
performed. No routines or prescriptions are created. Required logged prescription
snapshot fields use performed set counts and first-set performance as placeholders.
Existing workouts and routine prescriptions remain intact.

Imported sets participate in plots and future PR comparisons, with the agreed four
excluded sets omitted through the app's existing exercise annotations. Comments
are preserved. Historical PR badges/deltas are left unset. A transaction rolls
back all writes on failure; an app_settings/legacy_import_v1 marker prevents repeat
imports, even after deleting an imported workout. It also stores source hash,
source-session mappings, original dates and estimated-date bounds. Native datetime
fields use local noon on the source date as a placeholder; no actual time is known.

Regenerate from the original source:

```sh
python3 scripts/build_legacy.py ~/gymdata
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Regeneration replaces these generated artifacts. Do not edit them directly;
correct the conversion rules instead. Source-specific line overrides are validated
before generating output. Source text and its SHA-256 are embedded for provenance.

## Structure

`legacy_sessions` → `legacy_entries` → `legacy_sets`; entries optionally reference
`legacy_exercises`. Positions are zero-based within each entry. Entry source lines
preserve exercise order, indentation, raw notation, and notes. Notes-only blocks do
not constitute completed workouts: the bundled importer payload only includes blocks with sets.
Unresolved exercise labels are flagged during conversion and removed by the
approved review policy below.

Review decision: all remaining flagged source entries have been deleted from the
converted entries and sets, including partially parsed entries. Estimated dates
were accepted and retained. `removed_source_lines` in JSON and SQLite metadata
records the removed line numbers; the embedded original source is unchanged.
The converter applies this deletion again on regeneration.

Format version 2 adds `comment` and `exclude_from_tracking` to each entry in both
SQLite and JSON. Entry exclusions apply to every set belonging to that entry:
future app import must include those sets in history but exclude them from plots
and PR calculations. Lines 26 and 27 are excluded this way (four sets total).
Trailing prose and weight annotations become comments. Ignored `mm` and the other
agreed suffixes do not become comments or review flags. Numbers embedded in prose
remain in comments and are flagged when their interpretation may hide sets.

Dates are date-only strings, without invented workout times. Years follow descending
source order, anchored by January 2025 and the source's 2026 starting year. The
agreed `12.01` correction is December 1, 2024. Three undated June 2025 workouts are
evenly interpolated between the surrounding dated sessions. The final undated
block is provisionally placed one day before April 25, 2024. All four retain
`date_status = estimated` and known date bounds; these are not exact dates.
The final block's separation into another workout is itself inferred.

## Agreed conversion rules

- Kilograms; dumbbells per dumbbell, never doubled.
- Pc, Rc/Rgc, Jmp, Sk: fixed 10 kg bar plus the recorded added weight. In `9+12.5`,
  disregard the inconsistent original bar number: the result is 22.5 kg.
  Dumbbell skull crushers are a distinct exercise and do not receive a bar offset.
- Bench `6+1` means 6 unassisted reps; omit spotter-assisted reps.
- Repeated rep counts reuse the preceding explicit weight within an entry.
- Bodyweight pull-ups/dips use 0 added kg; negative assistance is preserved.
  Otherwise missing weights are NULL, rather than guessed from previous workouts.
- `#` is preserved as a new-weight marker. PR deltas are not inferred from check marks.
- Ignore the rep suffixes discussed with Lukas; retain the original text.
- Paused variations, incline press angles, and cable/machine variations stay separate.
- Idp/Idbp consolidate as Idp by angle. The two missing angles are assigned 75°
  (source line 2072) and 30° (2833), as agreed. Ibbp remains barbell incline press.
- All Bc variants consolidate as Bc 60; dumbbell Lr variants consolidate as Lr 60.
  Clr is cable lateral raise; Lrm is machine lateral raise. Ignore the single
  `Lr m trying out` entry and the bare Japanese-gym `idbp` entry.
- Rc/Rgc consolidate; Rcf is reverse cable fly, distinct from Rf/reverse fly.
- Ca/Ca lp are calf raises on leg press; Abd/Abd m are abductor machine.
- Suitcase carry counts are stored as reps. Br retains the name Br.
- Cp is Chest press; `Pu ng h` is Pu ng (ignore h).
- Mr during the Japanese-gym period becomes Machine row (partial), separate from
  Machine row elsewhere. The date window is September 25, 2024 through March 31,
  2025; September 25 is the last September entry, and has no Mr. Explicit
  `Mr partial` entries use the same partial exercise identity.

The parser is conservative about prose: numbers after ambiguous text are flagged
instead of silently becoming sets. Flagged entries are then removed under the
approved policy; recovering them would require changing that policy explicitly.
