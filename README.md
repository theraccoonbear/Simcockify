# Simcockify

Injects human-style typos into text. Typo frequency and "key distance" depend on tuning factors such as `Coffees`, `HoursOfSleep` and `DeadlinesLooming`. Output is repeatable: the same seed and options always give the same text.

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
| `Coffees` | `0` | velocity | Distance from neutral (2) raises typo reach and frequency. |
| `Espressos` | `0` | velocity | Raises typo reach and frequency. |
| `FiveHourEnergies` | `0` | velocity | Raises typo reach and frequency. |
| `HoursOfSleep` | `8` | frequency | Distance from 8 raises typo frequency. |
| `MinutesTalkingToClients` | `0` | frequency | Raises typo frequency. |
| `DeadlinesLooming` | `0` | frequency | Raises typo frequency. |
| `EmployeesBlocked` | `0` | frequency | Raises typo frequency. |
| `keyboardType` | QWERTY | | Keyboard map used to choose neighbouring keys. |
| `debug` / `logger` | `false` | | Log activity (to `console.log` or `logger`). |
| `exclude` | `.no-simcockify` | DOM only | Selector for elements to skip. |

With every value at its default, `Coffees: 0` is off-neutral, so a small number of typos is still produced. Use `Coffees: 2` with the other defaults for none.

## Library

```ts
import { simcockify, DEFAULT_OPTIONS, type SimcockifyOptions } from 'simcockify';

const options: SimcockifyOptions = { seed: 'repeatable-seed', Coffees: 4, DeadlinesLooming: 3 };
simcockify('Leverage agile frameworks to provide a robust synopsis.', options);
```

`createSimcockifier(options)` returns a function that applies typos to several texts using one PRNG stream.

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
| `--debug` | log activity to stderr |
| `--config <path.json>` | read options from a JSON file |
| `-h, --help`, `-v, --version` | |

A config file uses the option names, e.g. `{ "seed": "abc", "Coffees": 4, "HoursOfSleep": 5 }`. Flags override config values. Invalid flags, values or config files print a message to stderr and exit non-zero (2 for usage errors).

## Claude Code skill

`.claude/skills/simcockify/SKILL.md` lets Claude Code run drafted text through the CLI on request.

## Differences from the 1.x jQuery plugin

- The core is a pure function; the DOM is only touched by `simcockifyElement` and the jQuery adapter.
- The adapter edits text nodes in place instead of rebuilding the element's HTML. Whitespace around text is preserved rather than trimmed.
- The PRNG algorithm, option names, defaults and typo algorithm are unchanged; for the same seed the text produced matches 1.x.
- Option values are coerced to numbers (1.x concatenated string values in one sum, which mis-scaled values read from form inputs).
- A `seed` option is honoured per call. Without `seed` or `$.seedPRNG`, each call uses a fresh random seed.
- `window.KEYBOARD_MAPS` and `String.prototype.hashCode` are no longer defined globally.

## Sandbox

Try out [Simcockify here](https://theraccoonbear.github.io/Simcockify/sample.html). `sample.html` in this repository expects the build output in `dist/`.

## Write up

A [little background](https://earthlinginteractive.com/blog/item/simcockify-a-typo-generator-plugin) on the impetus for the plugin and the overwrought design.
