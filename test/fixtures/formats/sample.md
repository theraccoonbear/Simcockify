---
title: Release checklist for the platform team
tags: [release, checklist]
---

# Release checklist for the platform team #

Before shipping, read the [deployment guide](https://example.com/docs/deployment-guide "Deployment guide for operators") and the [rollback notes][rollback]. Run `npm run release --tag latest` only after the review, and see the ![architecture diagram](images/architecture-overview.png) first.

Setext heading for the operators
--------------------------------

~~~sh
npm run build --production
deploy release candidate to staging
~~~

```js
const message = "please review the attached proposal";
```

    indented example: restart the worker queue before lunch

- [ ] confirm the changes with the release manager
- [x] update the changelog with every merged request
  1. tell the support team about the release window
> Remember that the deadline is tight and the reviewers are busy.
> > Nested quotes should keep their markers intact.

| Component | Owner | Status |
| :-------- | :---: | -----: |
| Scheduler | Operations | Waiting on review |
| Frontend `bundle` | Design | Finished |

Contact <mailto:releases@example.com> or <https://example.com/status>, visit https://status.example.com/incidents for incidents, and write to oncall@example.com when something breaks &mdash; quickly.
Raw HTML like <span class="warning" data-level="high">this warning text</span> keeps its tags, and <!-- an html comment with words --> stays hidden.
Footnotes work too[^1]. *Emphasis* and **strong text** keep their markers, and escaped \*asterisks\* stay.

<pre>
preformatted block with several words inside
</pre>

[^1]: The footnote text itself is prose.
[rollback]: https://example.com/docs/rollback-notes "Rollback notes for operators"
