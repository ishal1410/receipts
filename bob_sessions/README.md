# bob_sessions

The IBM Bob tasks that built **this** repo, in three forms. **This folder is flat** —
there are no `reports/` or `screenshots/` subdirectories.

`tools/ritual.mjs` renames each file into the organiser's convention as it files it:

| file | what it is |
|---|---|
| `receipts_task<NN>_<slug>_export.json` | the machine-readable task export. **This is the tool's input.** |
| `receipts_task<NN>_<slug>_history.md` | Bob's own rendered task report: the prompt, the turns, the tool calls. |
| `receipts_task<NN>_<slug>_summary.png` | the task-session consumption summary, screenshotted as Bob displayed it. |

## What is here

| task | slug | what Bob did |
|---|---|---|
| 01 | `lib_rename` | Moved `tools/_chk.mjs` to `tools/lib.mjs` and fixed the three import/path lines the move broke. |
| 02 | `lib_jsdoc` | Wrote the JSDoc file header on `tools/lib.mjs`, describing the survival join. 25 lines; 24 still at HEAD. |

Two tasks, six files, all three counts equal. Verify it yourself:

```bash
git ls-files bob_sessions | grep -c '_export\.json$'   # 2
git ls-files bob_sessions | grep -c '_history\.md$'    # 2
git ls-files bob_sessions | grep -c '_summary\.png$'   # 2
```

Then read the evidence rather than the count. `_history.md` is Bob's own rendering
of the task — the prompt as given, each turn, each tool call — and the `_export.json`
beside it is the same task as machine data. Both tasks reached this repo's history,
and the commits name them:

```bash
git log --oneline --grep='by Bob'   # ec94423 task02, 4458a40 task01
git show ec94423                    # the JSDoc header Bob wrote, as it landed
```

The repo README's **Verify it yourself** section carries the rest: the context-window
figures, the discarded-work row, the freshness gate on `public/analysis.json`, and
`node tools/replay.mjs`, which re-derives the discarded-work verdict from scratch.

## This folder is not the whole corpus

`tools/snapshot.mjs` reads Bob exports from three workspaces: this folder, plus
`tools/fixtures/repo-a/` (workspace `bobtest`) and `tools/fixtures/repo-b/` (`bobtest2`)
— 6 tasks in all. Every one is a real redacted Bob export. **`tools/fixtures/` is the
dataset, not test scaffolding**; the test suite reads it because it is the real data, not
the other way round.

Per-task coins, survival and token figures live in `public/analysis.json` and on the live
page. They are not duplicated here, because they move.

## Bob's work is measured here, including where it was thrown away

**Bob's authored share of this repo is small.** Task 01 was a file move plus three lines;
task 02 was a comment block. The survival join in `tools/lib.mjs`, the snapshot pipeline,
the React components and the tools were written before and around those two tasks, not by
them. The dashboard does not hide this — it publishes Bob's authored line count per task,
and you can read it off the live page.

**And we overwrote some of it ourselves.** One line of task 02's header read
`remediations - Placeholder rule engine; returns an empty array until Task 9.`
Implementing that engine rewrote the line, so task 02 now measures 24 of its 25 lines
surviving and the corpus total moved from 28 of 29 to 27 of 29. Nobody edited a figure;
`git blame` changed and the snapshot followed. The same thing the `bobtest` case below
demonstrates, done by this project's own maintainers while building the tool that
measures it.

The `bobtest` workspace carries the case that matters. Commit `2d6bacb`
("B: docstring on add (by Bob)") is followed immediately by `8e8b929`
("C: human rewrites Bob's docstring"). Bob task `d0259633…` was paid **0.285058 coins**,
its output was approved, and a human overwrote it one commit later. Real discarded work,
no error raised anywhere.

That workspace's git history is a local checkout and is **not** part of this repo, so
`tools/fixtures/history.json` carries the data to rebuild it. `node tools/replay.mjs`
does the rebuild in a temp directory, re-runs the join, and diffs the result against
committed `public/analysis.json` — exiting non-zero on any disagreement. The rebuilt
commit SHAs differ on purpose (a neutral fixture author replaces a Windows username
that must not be published); the verdict is what reproduces, and the command prints
each rebuilt sha beside the one the dashboard cites.

That is not the same as a task whose output never reached a commit at all. A throwaway
spike has nothing to join against and reads as unjoined; discarded work landed and was
then replaced. Receipts reports them separately on purpose.

What Bob **is** structurally: its task export is the only input format this product
accepts. There is no other parser, no CSV path, no generic git-log mode. Point Receipts
at anything that is not a Bob export and it has nothing to measure.

## Why each task is exported one at a time

Bob can export only the **current** task, so each of these was captured immediately
after that task finished and before the next one began. Catch-up is impossible: a task
that was not exported at the time is gone. That is also why each task was committed on
its own — Receipts' task→commit join is time-ordered, and batched commits collapse it.

## A note on the screenshots

`tools/redact.mjs` scrubs text. It cannot read pixels, so every `.png` must be reviewed
by eye before it ships. `.gitignore` ignores `bob_sessions/*_summary.png` so that the
default outcome is "not yet reviewed" rather than "committed blind", and adding one takes
a deliberate `git add -f`.

The copies under `public/bob_sessions/` are the exception: the page renders them, so they
must be committed for the deployed site to show them, and that `.gitignore` guard does not
cover them. A commit to a public repo cannot be taken back.
