---
name: simcockify
description: Inject realistic human typos into text with the simcockify CLI. Use when asked to make drafted text look hastily typed, "simcockify" it, add typos, or produce repeatable typo-laden copy at a light or heavy intensity.
---

# Simcockify

Runs text through the `simcockify` CLI, which reads stdin and writes stdout. Output is repeatable for a fixed seed and options.

## Steps

1. Take the text to alter (for example a document already drafted). Do not change the wording first; typos are applied to the final text.
2. Write it to a temp file (for example under the scratchpad or `mktemp`) or pipe it directly.
3. Choose a seed (any string; reuse it to reproduce the result) and an intensity (table below).
4. Run with a time limit and bounded stdin:

   ```sh
   timeout 30 npx simcockify --seed <seed> [options] < /tmp/draft.txt
   ```

   Inside this repository, use the local build instead: `timeout 30 node bin/simcockify.js ...` (run `npm install && npm run build` first if `dist/` is missing).
5. Return the output. State the seed and options used so the run can be repeated.

Do not apply it to code, URLs, commands or data that must stay exact, unless asked. Markdown or HTML markup can be mangled by typos; mention this if the input has markup.

## Options

Frequency (how many typos): `--hours-of-sleep` (default 8, distance from 8 matters), `--deadlines-looming`, `--employees-blocked`, `--minutes-talking-to-clients` (all default 0).

Velocity (how far a typo lands from the intended key, plus a small frequency effect): `--coffees` (default 0, neutral is 2), `--espressos`, `--five-hour-energies` (default 0).

Other: `--seed <value>`, `--config <file.json>` (flags override it), `--keyboard QWERTY`, `--debug` (stderr).

Typos per word is `(|sleep-8|/8 + deadlines/20 + blocked/15 + minutes/1440 + 0.5 if |2-coffees| + energies + espressos > 0) / 5`. With defaults this is 0.1; only `--coffees 2` with everything else default gives none.

## Intensity mapping

| Intensity | Options | Approx. typos per word |
| --- | --- | --- |
| none | `--coffees 2` | 0 |
| light | `--coffees 2 --hours-of-sleep 7 --deadlines-looming 2` | 0.05 |
| medium | `--coffees 3 --hours-of-sleep 6 --deadlines-looming 5 --employees-blocked 3` | 0.24 |
| heavy | `--coffees 5 --hours-of-sleep 4 --deadlines-looming 10 --employees-blocked 8 --espressos 2` | 0.4 |
| extreme | `--coffees 6 --five-hour-energies 3 --hours-of-sleep 2 --deadlines-looming 20 --employees-blocked 15 --minutes-talking-to-clients 240` | 0.7 |

The number of typos is the word count times this rate, rounded up, so any non-zero rate changes short texts too.

## Errors

A non-zero exit code with a `simcockify:` message on stderr indicates invalid flags or config; fix the flag and rerun. Exit code 2 is a usage error.
