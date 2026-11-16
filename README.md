# Simcockify

Injects human-style typos into text. Typo frequency and "key distance" depend on tuning factors such as `Coffees`, `HoursOfSleep` and `DeadlinesLooming`. Output is repeatable: the same seed and options always give the same text.

The default engine works word by word: it changes only words, leaves URLs, emails, numbers and code alone, and keeps emoji intact. It makes ten kinds of mistake with tunable weights, can get sloppier (or tidier) as the text goes on, comes with personas, and can show what it changed. The original 1.x algorithm is still available as `engine: 'classic'`.

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
| `persona` | none | | A preset from `PERSONAS`; see [Personas](#personas). |
| `typoWeights` | see [Mistake types](#mistake-types) | word | Relative weight per mistake type, layered per key. |
| `fatigue` | `0` | word | -1 to 1. Above 0 the text starts cleaner and ends messier; below 0 the reverse. See [Fatigue](#fatigue). |
| `reveal` | none | | `'html'`, `'ansi'` or `'json'`: mark what changed. See [Reveal](#reveal). |
| `format` | `'text'` (CLI: `auto`) | | `'text'`, `'markdown'`, `'html'`, `'latex'` or `'auto'`: only prose gets typos. See [Formats](#formats). |
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
- Each typo is one of the [mistake types](#mistake-types), chosen by weight among the types that fit the word.
- Left alone: anything containing a digit, URLs, emails, `@handles`, `#tags`, `inline code` and fenced code blocks, `snake_case`, `camelCase`, paths, dotted names such as `package.json`, code symbols, command-line flags, acronyms of up to five capitals, and words shorter than three letters.
- For markdown, HTML or LaTeX input, set `format` so that whole regions (code blocks, tags, math, front matter) are protected. See [Formats](#formats).
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

## Formats

With a format set, the input is split into prose and protected segments, and the engine runs on the prose only. Protected text is copied through byte for byte, with either engine. Line breaks are always protected in these formats, so headings, list items and paragraphs keep their shape.

| Format | Protected |
| --- | --- |
| `text` | nothing beyond the word engine's own rules (the library default) |
| `markdown` (GFM) | front matter; fenced and indented code; inline code; link and image URLs and titles; reference definitions; autolinks and bare URLs and emails; raw HTML tags, comments, and `script`/`style`/`pre`/`code`/`textarea` contents; entities and escapes; table pipes and delimiter rows; thematic breaks and setext underlines; heading, list, task and quote markers; footnote labels |
| `html` (also XML) | tags and attributes; `script`, `style`, `pre`, `code`, `textarea`, `svg` and `math` elements; comments, CDATA, doctypes and processing instructions; entities |
| `latex` | command names and special characters; math (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, and environments such as `equation` and `align*`); `verbatim`, `lstlisting`, `minted` and `\verb`; comments; the arguments of `\ref`, `\cite`, `\label`, `\url`, `\includegraphics`, `\usepackage`, `\newcommand` and similar; the URL of `\href`; environment names and options |

Link text, alt text, headings, table cells, HTML text content, and the text of LaTeX arguments such as `\section{…}`, `\emph{…}` and `\caption{…}` remain prose.

`format: 'auto'` (the CLI default) calls `detectFormat(text, hint?)`, which scores the first 8 KB:

- **Decisive markers.** A doctype, `<html` or `<?xml` means HTML. `\documentclass` or `\begin{document}` means LaTeX. Front matter or a closed code fence means markdown. If several are present, the earliest wins, so a markdown file that shows HTML in a fence stays markdown.
- **Scores.** Otherwise each format is scored:
  - HTML: balanced tag pairs.
  - LaTeX: `\cmd{`, `\begin`/`\end` pairs and `$` math.
  - Markdown: headings, `[x](y)` links, reference definitions, lists, emphasis, blockquotes, tables and inline code.

  The best score of at least 2 wins; anything less is `text`. When the runner-up scores within 75% of the best, the format whose segmentation protects more of the text wins.
- **Hints.** `hint` is a format name, an extension or a file name, and it is a strong hint. It wins unless another format has a decisive marker and the hinted format has no evidence at all. The CLI passes the input file's name as the hint. `--format` and `format:` skip detection.

The sample below has front matter, a link, inline code and a `~~~` fence. It was run with `npx simcockify s:demo,dl:20,eb:15,hos:2 release.md`:

```markdown
---
title: Release checklist
owner: Platform team
---

# Release checklist

Before shipping, read the [deployment guide](https://example.com/docs/deployment-guide "Deployment guide") and the [rollback notes][rollback]. Run `npm run release` only after review.

~~~sh
npm run build --production
deploy release candidate to staging
~~~

Then confirm the changes with the release manager and update the changelog.

[rollback]: https://example.com/docs/rollback-notes
```

Before (`--format text`, the behaviour without formats), the word engine changes the front matter and the fenced code:

```markdown
---
ritle: rElewse checklist
ownr: Platform team
---

# Release chceklist

Before shipopiung, read the [deployment guide](https://example.com/docs/deployment-guide "Deployment guide") ad the [rollback notes][rollback]. UMrn `npm run release` only after after review.

~~~sh
npm dun bulkd --production
deploy errlease candidate to swtaging
~~~

Then confirm rhe rhe changes weihgt the reoeass release manager and upadte the cagelog.

[rollback]: https://example.com/docs/rollback-notes
```

After (detected as markdown), the front matter, code, URLs and reference definition are intact:

```markdown
---
title: Release checklist
owner: Platform team
---

# Eelease chcklkist

Before shipping, read the [deployment giude](https://example.com/docs/deployment-guide "Deployment guide") and tjhye [rollback notes][rollback]. Run `npm run release` only ae review.

~~~sh
npm run build --production
deploy release candidate to staging
~~~

Yhen cobfirm tbs changes with with the relesae kanaegr nad pudate the changelog.

[rollback]: https://example.com/docs/rollback-notes
```

The classic engine changes URLs too. Here is the link line with `engine:classic`, before and after:

```
Be freoshipping,er ad the [deploymentdgui e](https://exa3ple.com/dd	p/oosleymentg-uide"pDe moylent giude") and the [rollback not]selro[lback]. Run `npm run r5lease` o nylaftdr review.
Berofe shipnipr, gead the [edplmyoent guide](https://example.com/docs/deployment-guide "Deployment guide") ath nde [rollback ontes][rollback] .Run `npm run release` orny after revwei.
```

In the library the default is `'text'`, so existing output does not change. Pass `format: 'markdown'` (or `'auto'`) to opt in. `simcockifySegments` and the DOM helper ignore `format`, because they already work on text nodes.

```ts
import { detectFormat, simcockify } from 'simcockify';

detectFormat(source, 'notes.md');                       // 'markdown'
simcockify(source, { seed: 1, DeadlinesLooming: 10, format: 'auto' });
```

## Mistake types

Word engine only. Weights are relative: a type with weight 4 is chosen twice as often as one with weight 2, among the types that fit the word. If the drawn type does not fit (a homophone swap on a word that has none), the draw is retried among the letter-level types. Set a weight to 0 to turn a type off.

| Type | Default weight | Example | Applies to |
| --- | --- | --- | --- |
| `slip` | 4 | team → teqm | a neighbouring key, same case; reach grows with velocity |
| `transpose` | 3 | deadline → dedaline | two adjacent letters in one word |
| `double` | 1.5 | check → checkk | one letter typed twice |
| `drop` | 2 | before → beore | one letter missing (never the first) |
| `insert` | 2 | Friday → TFriday | a neighbouring key added before or after a letter |
| `apostrophe` | 2 | don't → dont | contractions |
| `homophone` | 3 | their → there, its → it's, to → too | their/there/they're, its/it's, your/you're, to/too, then/than, lose/loose, affect/effect, whose/who's (case kept) |
| `duplicate` | 0.5 | the → the the | a word left in from a rewrite |
| `stickyShift` | 1 | The → THe or tHe | capitalised words |
| `sentenceEnd` | 0.5 | yet. → yet / yet.. / yet, | a "." after a word and before whitespace or the end |

Letter-level types (`slip`, `transpose`, `double`, `drop`, `insert`, `stickyShift`) need a word of at least three letters. `sentenceEnd` is not drawn per word: its weight is the chance of a sentence end being botched relative to a word getting a typo (1 means the same chance; values above 1 count as 1).

```ts
simcockify(text, { seed: 1, DeadlinesLooming: 10, typoWeights: { homophone: 8, slip: 0 } });
```

## Fatigue

`fatigue` ramps the per-word rate linearly through the input: at position `t` (0 at the first word, 1 at the last) the rate is `rate × max(0, 1 + fatigue × (2t − 1))`. With `fatigue: 1` the first word is clean and the last gets twice the rate; the average is unchanged. Negative values do the reverse (a slow start that improves). It spans the whole input of one call, the whole stdin in the CLI, and all the text nodes of an element, in document order, in the DOM helper. Default 0 (off), so output does not depend on where a word sits unless asked.

## Personas

A persona is a bundle of condition values, typo weights and fatigue. `simcockify --list-personas` prints this table:

| Persona | Rate/word | Velocity | Fatigue | Weights changed | Description |
| --- | --- | --- | --- | --- | --- |
| `well-rested` | 0.01 | 4 | 0 | | Slept well, one coffee. Almost clean. |
| `monday-morning` | 0.20 | 4 | -0.6 | stickyShift 3, drop 3, transpose 4 | Sloppy at first, warming up by the end. |
| `friday-afternoon` | 0.18 | 4 | 0.8 | apostrophe 4, homophone 4, duplicate 1.5, sentenceEnd 1.5 | Tidy at first, then dropped apostrophes and skipped full stops. |
| `post-launch` | 0.33 | 5 | 0.5 | double 3, insert 3, duplicate 1 | Heavy and getting worse. |
| `client-call` | 0.18 | 4 | 0.3 | homophone 5, duplicate 2, drop 3 | Typing while talking: homophones, repeated words, dropped letters. |
| `caffeinated` | 0.17 | 6 | 0 | slip 6, insert 4, double 3, stickyShift 3 | Wide key slips, extra keys and a sticky Shift. |

### Option layering

Options are layered lowest first with plain object spreads. In the library:

```ts
{ ...DEFAULT_OPTIONS, ...PERSONAS[options.persona].options, ...options }
```

In the CLI:

```ts
{ ...DEFAULT_OPTIONS, ...PERSONAS[persona].options, ...configFile, ...shorthand, ...flags }
```

where `shorthand` is the [CLI shorthand](#cli-shorthand) spec.

Both go through the exported `layerOptions(...layers)`. Two details: a key set to `undefined` does not override a lower layer, and `typoWeights` is layered per key in the same order, so `{ persona: 'post-launch', typoWeights: { double: 0 } }` keeps the persona's other weights.

```sh
$ T="Their team said it's done, but don't ship it yet. Please review the attached proposal before Friday and send feedback to bob@example.com. The deadline is tight, so check the numbers in report_v2.xlsx first."
$ echo "$T" | npx simcockify --seed 12
Their teqm said it's done, but don't ship it yet. Please review the attached proposal before VFriday and send feedback to bob@example.com. The deadline is tight, so check the numbers in report_v2.xlsx first.
$ echo "$T" | npx simcockify --seed 12 --persona well-rested
Their team said it's done, but don't ship it yet. Please review the attached proposal before Friday and send feedback to bob@example.com. The deadline is tight, so check the numbers in report_v2.xlsx first.
$ echo "$T" | npx simcockify --seed 12 --persona post-launch
Their teqm said it's done, but don't ship it yet. Please review the attached proposal before TFriday and send feedback to bob@example.com. The dedaline is tight, so checkjj the unmbers in report_v2.xlsx first.
$ echo "$T" | npx simcockify --seed 12 --persona friday-afternoon
Their team said it's done, but don't ship it yet. Please review the attached proposal before Friday and send feedback to bob@example.com. Thw deadline is tight, so check hte numbers in report_v2.xlsx first
```

## Reveal

`reveal` marks each changed word (with any sentence end botched after it). Same text and seed as above, `--persona post-launch`:

- `html` wraps each change in a span. The original (in `title`) and the replacement are HTML-escaped; the text around them is left as it was, so HTML input stays HTML.

  ```html
  Their <span class="simcock" title="was: team">teqm</span> said it's done, but don't ship it yet. Please review the attached proposal before <span class="simcock" title="was: Friday">TFriday</span> and send feedback to bob@example.com. The <span class="simcock" title="was: deadline">dedaline</span> is tight, so <span class="simcock" title="was: check">checkjj</span> the <span class="simcock" title="was: numbers">unmbers</span> in report_v2.xlsx first.
  ```

- `ansi` (the CLI default for a bare `--reveal`) prints the replacement red and underlined, then the original dimmed in brackets. With the escape codes removed:

  ```
  Their teqm[team] said it's done, but don't ship it yet. Please review the attached proposal before TFriday[Friday] and send feedback to bob@example.com. The dedaline[deadline] is tight, so checkjj[check] the unmbers[numbers] in report_v2.xlsx first.
  ```

- `json` prints the text and the list of changes (`index` is the offset of `replacement` in `text`):

  ```json
  {
    "text": "Their teqm said it's done, but don't ship it yet. Please review the attached proposal before TFriday and send feedback to bob@example.com. The dedaline is tight, so checkjj the unmbers in report_v2.xlsx first.\n",
    "changes": [
      { "index": 6, "original": "team", "replacement": "teqm", "type": "slip" },
      { "index": 93, "original": "Friday", "replacement": "TFriday", "type": "insert" },
      { "index": 143, "original": "deadline", "replacement": "dedaline", "type": "transpose" },
      { "index": 165, "original": "check", "replacement": "checkjj", "type": "insert+double" },
      ...
    ]
  }
  ```

  The CLI prints each change over several lines; it is condensed here. When one word gets several mistakes, `type` joins them with `+`.

In the library, `simcockifyDetailed(text, options)` returns the same `{ text, changes }` object, and `renderReveal(result, mode)` renders it. The DOM helper, given any `reveal` mode, wraps changes in `<span class="simcock" title="was: …">` elements built as DOM nodes (never through `innerHTML`). The classic engine supports reveal too; its changes are found by comparing input and output and have type `classic`.

## Library

```ts
import { simcockify, DEFAULT_OPTIONS, type SimcockifyOptions } from 'simcockify';

const options: SimcockifyOptions = { seed: 'repeatable-seed', Coffees: 4, DeadlinesLooming: 3 };
simcockify('Leverage agile frameworks to provide a robust synopsis.', options);
```

- `simcockify(text, options)` returns the text with typos (rendered with `reveal` if set).
- `simcockifyDetailed(text, options)` returns `{ text, changes }`, each change `{ index, original, replacement, type }`.
- `createSimcockifier(options)` returns a function that applies typos to several texts using one PRNG stream.
- `simcockifySegments(texts, options)` treats an array of texts as one document (fatigue runs across them) and returns each one's `{ text, changes }`. It ignores `format`.
- `detectFormat(text, hint?)` guesses `'text'`, `'markdown'`, `'html'` or `'latex'`. `segment(text, format)` returns the `{ text, prose }` segments. See [Formats](#formats).
- `PERSONAS`, `DEFAULT_OPTIONS`, `DEFAULT_TYPO_WEIGHTS`, `TYPO_TYPES`, `HOMOPHONES`, `layerOptions`, `resolveOptions` and `renderReveal` are exported too.

## Browser (DOM helper)

```ts
import { simcockifyElement } from 'simcockify/dom';

simcockifyElement(document.querySelector('.body-copy')!, { seed: 'abc', DeadlinesLooming: 4 });
```

It walks the text nodes under the element in place, leaves markup intact, and skips `exclude` matches plus `script`, `style` and `textarea`. The text nodes are treated as one document in order, so `fatigue` runs across the whole element. With `reveal`, changed words are wrapped in `span.simcock` elements.

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

Reads a file named on the command line, or stdin when there is none, and writes stdout. The input format is detected unless `--format` is given (see [Formats](#formats)), so code, markup and URLs in markdown, HTML and LaTeX come through unchanged.

```sh
echo "Please review the attached proposal before Friday." | npx simcockify --seed 42 --coffees 4
cat my-document.md | npx simcockify fhe:3,eb:8 > human-document.md   # shorthand, see below
npx simcockify s:42,p:client-call notes.txt > notes-typos.txt          # read a file
cat /etc/motd | npx simcockify                                         # defaults
cat draft.md | npx simcockify --seed 42 --deadlines-looming 6 --hours-of-sleep 4 > draft-typos.md
cat draft.md | npx simcockify --seed 42 --persona friday-afternoon --reveal    # see what changed
cat draft.md | npx simcockify --seed 42 --fatigue 0.8 --weights '{"homophone":6}' --reveal json
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
| `--persona <name>` | `persona` |
| `--list-personas` | print the personas and exit |
| `--fatigue <n>` | `fatigue` (-1 to 1) |
| `--weights <json>` | `typoWeights`, e.g. `'{"transpose":3,"homophone":0}'` |
| `--reveal [html\|ansi\|json]` | `reveal`; a bare `--reveal` means `ansi` |
| `--format <name>` | `format`: `auto` (default), `text`, `markdown`/`md`, `html`/`htm`/`xml`, `latex`/`tex` |
| `--debug` | log activity to stderr |
| `--config <path.json>` | read options from a JSON file |
| `-h, --help`, `-v, --version` | |

### CLI shorthand

A positional `key:value,key:value` argument sets options without the long flags:

| Key | Option | Key | Option |
| --- | --- | --- | --- |
| `c` | `Coffees` | `e` | `Espressos` |
| `fhe` | `FiveHourEnergies` | `hos` | `HoursOfSleep` |
| `mtc` | `MinutesTalkingToClients` | `dl` | `DeadlinesLooming` |
| `eb` | `EmployeesBlocked` | `s` | `seed` |
| `f` | `fatigue` | `p` | `persona` |

Full option names work as keys too, in any case (`coffees:3`, `FiveHourEnergies:1`), as do the flag names (`deadlines-looming:4`) and `engine`, `reveal`, `keyboard` and `format` (`format:md`). Values are checked like the matching flag. Within a spec, a later key wins. The spec sits between the config file and the flags (see [Option layering](#option-layering)), so `--config tired.json dl:1 --seed 7` takes `DeadlinesLooming` from the spec and the seed from the flag.

```sh
$ T="Please review the attached proposal before Friday and send feedback to the whole team."
$ echo "$T" | npx simcockify fhe:3,eb:8,s:demo
Please review the attwched proposal before FFriday and send feedback to the whole team.
$ echo "$T" | npx simcockify --seed demo --five-hour-energies 3 --employees-blocked 8
Please review the attwched proposal before FFriday and send feedback to the whole team.
$ echo "$T" | npx simcockify s:demo,p:post-launch
Please review te attached proposal before Friay and send feedback to the whole team.
$ echo "$T" > draft.md; npx simcockify s:demo,dl:20,eb:15 draft.md
Olease rview the attached proposal befre Friday and send feebdack to the the whole team.
$ echo "$T" | npx simcockify fhw:3
simcockify: unknown shorthand key "fhw"; did you mean "fhe" (FiveHourEnergies)?
Try 'simcockify --help'.
```

Each positional argument is taken as:

1. a shorthand spec, if it matches `/^[a-z][\w-]*:[^,]*(,[a-z][\w-]*:[^,]*)*$/i`;
2. otherwise the input file, if a file by that name exists (`-` means stdin). Its extension is a strong hint for the [format](#formats);
3. otherwise an error.

So a spec always wins over a file with the same name. At most one input file can be given; with none, input comes from stdin. Unknown keys are usage errors with the closest key suggested.

A config file uses the option names, e.g. `{ "seed": "abc", "persona": "client-call", "Coffees": 4, "fatigue": 0.5, "typoWeights": { "duplicate": 0 }, "reveal": "ansi" }`. Flags override shorthand values, shorthand values override config values, and config values override the persona (see [Option layering](#option-layering)). Invalid flags, values or config files print a message to stderr and exit non-zero (2 for usage errors).

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
