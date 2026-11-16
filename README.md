# Simcockify

Injects human-style typos into text. Typo frequency and "key distance" depend on tuning factors such as `Coffees`, `HoursOfSleep` and `DeadlinesLooming`. Output is repeatable: the same seed and options always give the same text.

The default engine works word by word: it changes only words, leaves URLs, emails, numbers and code alone, and keeps emoji intact. The original 1.x algorithm is still available as `engine: 'classic'`.

Available as a TypeScript library (no dependencies), a DOM helper, an optional jQuery plugin, and a command-line tool.

```sh
npm install
npm run build     # compiles to dist/ and builds the browser bundle
npm test
```

## Options

| Option | Default | Kind | Effect |
| --- | --- | --- | --- |
| `seed` | random | | Seed for the PRNG (string or number). |
| `engine` | `'word'` | | `'word'` or `'classic'` (the 1.x algorithm; old seeds reproduce exactly). See [Engines](#engines). |
| `Coffees` | `0` | velocity | Distance from neutral (2) raises slip distance and frequency. |
| `Espressos` | `0` | velocity | Raises slip distance and frequency. |
| `FiveHourEnergies` | `0` | velocity | Raises slip distance and frequency. |
| `HoursOfSleep` | `8` | frequency | Distance from 8 raises typo frequency. |
| `MinutesTalkingToClients` | `0` | frequency | Raises typo frequency. |
| `DeadlinesLooming` | `0` | frequency | Raises typo frequency. |
| `EmployeesBlocked` | `0` | frequency | Raises typo frequency. |
| `keyboardType` | QWERTY | | Keyboard map used to choose neighbouring keys. |
| `debug` / `logger` | `false` | | Log activity (to `console.log` or `logger`). |
| `exclude` | `.no-simcockify` | DOM only | Selector for elements to skip. |

The frequency factors set a rate of typos per word:

```
rate = (|HoursOfSleep - 8| / 8 + DeadlinesLooming / 20 + EmployeesBlocked / 15
        + MinutesTalkingToClients / 1440 + (0.5 if |2 - Coffees| + FiveHourEnergies + Espressos > 0)) / 5
```

With every value at its default, `Coffees: 0` is off-neutral, so the rate is 0.1. Use `Coffees: 2` with the other defaults for a rate of 0 (no typos).

The velocity factors set `velocity = 2 + round(2 + FiveHourEnergies / 8 + |Coffees - 2| / 10 + Espressos / 5)`, which is 4 at the defaults. In the word engine it is the slip distance: 4 hits only the keys touching the intended one, and each step above 4 reaches half a key further.

## Engines

**`word` (default).** The text is split into words, whitespace and punctuation, and only words change:

- Each word gets a number of typos drawn from the rate (about `rate` per word on average, at most 3). There is no minimum, so short texts often come through unchanged and a rate of 0 changes nothing.
- Typos: key slip (a neighbouring key, in the same case), transposition of two adjacent letters, and an extra neighbouring key inserted next to a letter.
- Left alone: anything containing a digit, URLs, emails, `@handles`, `#tags`, `inline code` and fenced code blocks, `snake_case`, `camelCase`, paths, dotted names such as `package.json`, code symbols, command-line flags, acronyms of up to five capitals, and words shorter than three letters.
- Letters are handled by code point together with any combining marks, so emoji, surrogate pairs and accented letters are never split.

**`classic`.** The 1.x algorithm, unchanged, so a 1.x seed gives the same text. It works on whole text chunks and has known flaws: transpositions can swap characters several places apart, across spaces and punctuation; the "extra character" typo overwrites the next character instead of inserting; positions are biased toward the start and never reach the last character; the neighbour lookup skips some rows and columns; and every non-empty chunk (each DOM text node) gets at least one typo whenever the rate is above zero.

```sh
$ echo "Please review the attached proposal before Friday and send feedback to bob@example.com." \
    | npx simcockify --seed 42 --deadlines-looming 10 --hours-of-sleep 4
Please review the attached proposal before Firday and send feedback to bob@example.com.

$ echo "Please review the attached proposal before Friday and send feedback to bob@example.com." \
    | npx simcockify --seed 42 --deadlines-looming 10 --hours-of-sleep 4 --engine classic
lPease rev ewithe attached proposal before Fridaa ynd seed fnedback to bob@example.com.
```

## Library

```ts
import { simcockify, DEFAULT_OPTIONS, type SimcockifyOptions } from 'simcockify';

const options: SimcockifyOptions = { seed: 'repeatable-seed', Coffees: 4, DeadlinesLooming: 3 };
simcockify('Leverage agile frameworks to provide a robust synopsis.', options);
```

`createSimcockifier(options)` returns a function that applies typos to several texts using one PRNG stream. `simcockifySegments(texts, options)` applies typos to an array of texts in order and returns each one's `{ text, changes }`; with the word engine, `changes` lists `{ index, original, replacement, type }` for each changed word (`index` is the offset in the output).

## Browser (DOM helper)

```ts
import { simcockifyElement } from 'simcockify/dom';

simcockifyElement(document.querySelector('.body-copy')!, { seed: 'abc', DeadlinesLooming: 4 });
```

It walks the text nodes under the element in place, leaves markup intact, and skips `exclude` matches plus `script`, `style` and `textarea`.

For a plain `<script>` tag, load `dist/simcockify.browser.js`, which defines the global `Simcockify` (all exports plus `simcockifyElement`) and registers the jQuery plugin when jQuery is already on the page.

## jQuery adapter

jQuery is optional. Load jQuery first, then the browser bundle:

```html
<script src="jquery.min.js"></script>
<script src="dist/simcockify.browser.js"></script>
<script>
	$.seedPRNG('repeatable-seed-abc-123'); // optional; calls then share one stream
	$('.body-copy').simcockify({ Coffees: 2, DeadlinesLooming: 2, EmployeesBlocked: 1 });
</script>
```

With a module bundler: `import { install } from 'simcockify/jquery'; install($);`.

## CLI

Reads stdin, writes stdout.

```sh
echo "Please review the attached proposal before Friday." | npx simcockify --seed 42 --coffees 4
cat draft.md | npx simcockify --seed 42 --deadlines-looming 6 --hours-of-sleep 4 > draft-typos.md
pbpaste | npx simcockify --seed demo | pbcopy
npx simcockify --config tired.json --seed 7 < in.txt
```

| Flag | Option |
| --- | --- |
| `--seed <value>` | `seed` |
| `--coffees <n>` | `Coffees` |
| `--espressos <n>` | `Espressos` |
| `--five-hour-energies <n>` | `FiveHourEnergies` |
| `--hours-of-sleep <n>` | `HoursOfSleep` |
| `--minutes-talking-to-clients <n>` | `MinutesTalkingToClients` |
| `--deadlines-looming <n>` | `DeadlinesLooming` |
| `--employees-blocked <n>` | `EmployeesBlocked` |
| `--keyboard <name>` | `keyboardType` (only `QWERTY`) |
| `--engine <word\|classic>` | `engine` |
| `--debug` | log activity to stderr |
| `--config <path.json>` | read options from a JSON file |
| `-h, --help`, `-v, --version` | |

A config file uses the option names, e.g. `{ "seed": "abc", "Coffees": 4, "HoursOfSleep": 5 }`. Flags override config values. Invalid flags, values or config files print a message to stderr and exit non-zero (2 for usage errors).

## Claude Code skill

`.claude/skills/simcockify/SKILL.md` lets Claude Code run drafted text through the CLI on request.

## Differences from the 1.x jQuery plugin

- The core is a pure function; the DOM is only touched by `simcockifyElement` and the jQuery adapter.
- The adapter edits text nodes in place instead of rebuilding the element's HTML. Whitespace around text is preserved rather than trimmed.
- The default engine is new (see [Engines](#engines)). With `engine: 'classic'` (`--engine classic`), the PRNG, option names, defaults and typo algorithm are unchanged; for the same seed the text produced matches 1.x.
- The word engine seeds the same multiply-with-carry generator from a mixed hash of the seed, because similar seeds (`1`, `2`, `a`, `b`) gave correlated streams with the 1.x seeding. The classic engine keeps the 1.x seeding.
- Option values are coerced to numbers (1.x concatenated string values in one sum, which mis-scaled values read from form inputs).
- A `seed` option is honoured per call. Without `seed` or `$.seedPRNG`, each call uses a fresh random seed.
- `window.KEYBOARD_MAPS` and `String.prototype.hashCode` are no longer defined globally.

## Sandbox

Try out [Simcockify here](https://theraccoonbear.github.io/Simcockify/sample.html). `sample.html` in this repository expects the build output in `dist/`.

## Write up

A [little background](https://earthlinginteractive.com/blog/item/simcockify-a-typo-generator-plugin) on the impetus for the plugin and the overwrought design.
