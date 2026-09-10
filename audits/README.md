# audits/

One directory per client, one dated directory per run:

```
audits/
    saam-s-store/
        2026-09-10/          first audit
            report.html      the deliverable — self-contained, prints to PDF
            perf.json        Core Web Vitals, waterfall, transfer sizes
            security.json    headers, cookies, TLS, tech disclosure
            source.json      dependency + code scan (when the repo was in hand)
            screenshots/     phone and laptop width, every page tested
            TRIAGE.md        what was kept, what was dropped, and why
        2027-01-xx/          after the fixes — the before/after
    another-client/
        2026-07-02/
```

- **Client slug**: lowercase, hyphenated, stable forever. `saam-s-store`, not
  `Saam's Store (new)`.
- **Date**: `YYYY-MM-DD`, the day the collectors ran, not the day the report
  went out. Sorts correctly and matches the timestamps inside the JSON.
- Everything in a run directory comes from `--out` pointing at it. Point all
  four scripts at the same directory and `report.mjs` picks up whatever is
  there.
- Never overwrite an old run to "refresh" it. A new date is a new directory —
  that is the whole point of the layout.

`TRIAGE.md` is worth writing every time. It records which scanner findings
were discarded and on what grounds, which is the first thing anyone asks
months later — including you.

## These are committed. Keep the repo private.

Audit runs are tracked here on purpose: the archive is the point, and two
runs of the same site months apart is the most persuasive thing this toolkit
produces.

That only works while **this repository is private**. A run directory
describes unfixed weaknesses in somebody's live website, in enough detail to
act on. Before adding a client here, check that the repo is still private and
that the client is content for their audit to live in it.

If a finding is still unfixed and the repo's visibility ever changes, the
history keeps it public regardless — making a repo private later does not
retract what was public in between. Treat visibility as the control that
matters, not the file layout.

Two other habits worth keeping:

- **Disclose before you archive.** If an audit turns up something serious on a
  site you do not solely control, tell the owner privately first. See
  `.claude/skills/web-audit/references/security.md`.
- **Never commit a live credential.** Findings quote evidence, and evidence
  gets trimmed and redacted before it goes in a report. Grep a run directory
  for connection strings and keys before committing it.
