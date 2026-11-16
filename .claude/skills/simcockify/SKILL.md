---
name: simcockify
description: Inject realistic human typos into text with the simcockify CLI. Use when asked to make drafted text look hastily typed, "simcockify" it, add typos, or produce repeatable typo-laden copy at a light or heavy intensity.
---

# Simcockify

Runs text through the `simcockify` CLI, which reads stdin and writes stdout. Output is repeatable for a fixed seed and options.

## Steps

1. Take the text to alter (for example a document already drafted). Do not change the wording first; typos are applied to the final text.
2. Write it to a temp file (for example under the scratchpad or `mktemp`) or pipe it directly.
3. Choose a seed (any string; reuse it to reproduce the result) and an intensity or persona (tables below).
4. Run with a time limit and bounded stdin:

   ```sh
   timeout 30 npx simcockify --seed <seed> [options] < /tmp/draft.txt
   ```

   Inside this repository, use the local build instead: `timeout 30 node bin/simcockify.js ...` (run `npm install && npm run build` first if `dist/` is missing).
5. Return the output. State the seed and options used so the run can be repeated.
6. If asked what changed, rerun with the same seed and options plus `--reveal ansi` (terminal), `--reveal html` (spans with `title="was: …"`) or `--reveal json` (`{ text, changes: [{ index, original, replacement, type }] }`). Never pass reveal output on as the final text.

The default (word) engine changes only words. It leaves URLs, emails, numbers, `@handles`, `#tags`, inline and fenced code, `snake_case`, `camelCase`, paths, file names, flags, short acronyms and words under three letters exactly as they are, and never splits emoji. Words inside HTML tags or other markup can still change, so mention this if the input has markup. Still do not run code or data that must stay exact through it.

## Options

Frequency (how many typos): `--hours-of-sleep` (default 8, distance from 8 matters), `--deadlines-looming`, `--employees-blocked`, `--minutes-talking-to-clients` (all default 0).

Velocity (how far a typo lands from the intended key, plus a small frequency effect): `--coffees` (default 0, neutral is 2), `--espressos`, `--five-hour-energies` (default 0).

Style (word engine): `--persona <name>` (presets, see below), `--fatigue <-1..1>` (above 0 starts clean and ends messier, below 0 the reverse; default 0), `--weights '<json>'` (relative weight per mistake type: slip, transpose, double, drop, insert, apostrophe, homophone, duplicate, stickyShift, sentenceEnd; 0 turns a type off).

Other: `--seed <value>`, `--config <file.json>` (flags override it, it overrides the persona), `--keyboard QWERTY`, `--debug` (stderr), `--engine word|classic`. Use `--engine classic` only to reproduce output from 1.x or an earlier run made with it; it swaps characters across spaces and changes URLs and numbers.

Typos per word (the rate) is `(|sleep-8|/8 + deadlines/20 + blocked/15 + minutes/1440 + 0.5 if |2-coffees| + energies + espressos > 0) / 5`. With defaults this is 0.1; only `--coffees 2` with everything else default gives none. Velocity sets how far a key slip can land (4, the default and minimum, means adjacent keys only).

## Intensity mapping

| Intensity | Options | Approx. typos per word |
| --- | --- | --- |
| none | `--coffees 2` | 0 |
| light | `--coffees 2 --hours-of-sleep 7 --deadlines-looming 2` | 0.05 |
| medium | `--coffees 3 --hours-of-sleep 6 --deadlines-looming 5 --employees-blocked 3` | 0.24 |
| heavy | `--coffees 5 --hours-of-sleep 4 --deadlines-looming 10 --employees-blocked 8 --espressos 2` | 0.4 |
| extreme | `--coffees 6 --five-hour-energies 3 --hours-of-sleep 2 --deadlines-looming 20 --employees-blocked 15 --minutes-talking-to-clients 240` | 0.7 |

Each word gets about `rate` typos on average, with no minimum, so a short text at a light intensity may come back unchanged; try another seed or a higher intensity if a visible change is wanted.

Add `--fatigue 0.5` to any row for text that gets sloppier toward the end. For text that must not change meaning (for example a message where "their/there" or a dropped full stop would mislead), add `--weights '{"homophone":0,"duplicate":0,"sentenceEnd":0}'`.

## Personas

A persona sets the conditions, weights and fatigue in one flag; explicit flags and config values still override it. `--list-personas` shows them.

| Persona | Rate/word | Character | Nearest intensity |
| --- | --- | --- | --- |
| `well-rested` | 0.01 | almost clean | light, lighter |
| `monday-morning` | 0.20 | sloppy start, improving; sticky Shift, dropped letters | medium |
| `friday-afternoon` | 0.18 | tidy start, worse by the end; dropped apostrophes, homophones, missing full stops | medium |
| `client-call` | 0.18 | homophones, repeated words, dropped letters | medium |
| `caffeinated` | 0.17 | wide key slips, extra keys, doubled letters | medium |
| `post-launch` | 0.33 | heavy and getting worse | heavy |

When a request names a mood or situation ("Monday morning", "end of a long week", "in a hurry on a call"), pick the matching persona; when it names an intensity, use the intensity table.

## Errors

A non-zero exit code with a `simcockify:` message on stderr indicates invalid flags or config; fix the flag and rerun. Exit code 2 is a usage error.
