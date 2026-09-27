# bob_sessions

Every IBM Bob task that built this project, in three forms. **This folder is flat** —
there are no `reports/` or `screenshots/` subdirectories.

`tools/ritual.mjs` renames each file into the organiser's convention as it files it:

| file | what it is |
|---|---|
| `receipts_task<NN>_<slug>_export.json` | the machine-readable task export. **This is the tool's input** — `tools/snapshot.mjs` reads these and nothing else. |
| `receipts_task<NN>_<slug>_history.md` | Bob's own rendered task report: the prompt, the turns, the tool calls. |
| `receipts_task<NN>_<slug>_summary.png` | the task-session consumption summary, screenshotted as Bob displayed it. |

## What is here

| task | slug | what Bob did |
|---|---|---|
| 01 | `lib_rename` | Moved `tools/_chk.mjs` to `tools/lib.mjs` and fixed the three import/path lines the move broke. |
| 02 | `lib_jsdoc` | Wrote the JSDoc file header on `tools/lib.mjs`, describing the survival join. |

Two tasks, six files, all three counts equal. Verify it yourself:

```bash
git ls-files bob_sessions | grep -c '_export\.json$'
git ls-files bob_sessions | grep -c '_history\.md$'
git ls-files bob_sessions | grep -c '_summary\.png$'
```

## Stated plainly, so you do not have to infer it

**Bob's authored share of this codebase is small.** Task 01 was a file move plus three
lines; task 02 was a comment block. The survival join in `tools/lib.mjs`, the snapshot
pipeline, the React components and the five tools were written before and around those
two tasks, not by them. The dashboard does not hide this — it publishes Bob's authored
line count per task, and you can read it off the live page.

What Bob **is** structurally, and this is the part that matters: its task export is the
only input format this product accepts. There is no other parser, no CSV path, no
generic git-log mode. Point Receipts at anything that is not a Bob export and it has
nothing to measure.

## Why each task is exported one at a time

Bob can export only the **current** task, so each of these was captured immediately
after that task finished and before the next one began. Catch-up is impossible: a task
that was not exported at the time is gone. That is also why each task was committed on
its own — Receipts' task→commit join is time-ordered, and batched commits collapse it.

## A note on the screenshots

`tools/redact.mjs` scrubs text. It cannot read pixels. Each `.png` was therefore reviewed
by eye before it was added with `git add -f` — `.gitignore` deliberately ignores
`bob_sessions/*_summary.png` so that the default outcome is "not yet reviewed" rather
than "committed blind". A commit to a public repo cannot be taken back.
