# audits/

One directory per client, one dated directory per run:

```
audits/
    bloomfield/
        2026-03-14/          first audit — the pitch
            perf.json
            security.json
            screenshots/
            report.html
            report.md
        2026-09-10/          after the fixes — the before/after
            ...
    another-client/
        2026-07-02/
```

- **Client slug**: lowercase, hyphenated, stable forever. `bloomfield`, not
  `Bloomfield Garden Centre (new)`.
- **Date**: `YYYY-MM-DD`, the day the collectors ran, not the day the report
  went out. Sorts correctly and matches the timestamps inside the JSON.
- Everything in a run directory comes from `--out` pointing at it. Point all
  four scripts at the same directory and `report.mjs` picks up whatever is
  there.
- Never overwrite an old run to "refresh" it. A new date is a new directory —
  that is the whole point of the layout.

## Nothing in here is committed

`.gitignore` excludes the contents of this directory, and this repo is
**public**. A run directory contains unfixed vulnerabilities on somebody
else's live website: an exposed key, a form that posts credentials in the
clear, a version with a known CVE. Publishing that is handing it to whoever
looks, and it is the client's exposure, not mine to publish.

Only this file and `.gitkeep` are tracked. If a run ever needs to be shared,
send the client their own report directly, or put it somewhere private.
