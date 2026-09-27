# Receipts

Receipts reads IBM Bob's exported task-session JSON and shows, per task, what was spent, whether that task's code is still in the repo, and where the context budget went. Live at https://receipts-black-five.vercel.app — repo at https://github.com/ishal1410/receipts.

## Why

Bob already measures its own cost precisely — per task, per turn, per context category — and then drops the measurement on the floor when the task closes. Receipts is the panel that reads it.

Two things become visible once you read it. First, where the context budget actually goes before the agent sees a prompt. Second, the harder question next to it: when a human approves an AI-authored change, does it stay in the codebase? Sometimes it does not, and that case is in the corpus.

## What it shows

Four panels over one dataset:

- **Task table** — every Bob task in the corpus, its cost in Bobcoins, and a survival verdict for the code it wrote.
- **Survival chart** — cost plotted against survival, so an expensive task that did not stick is visible at a glance.
- **Context panel** — where each task's context went, by category (skills, tool definitions, project rules, the rest).
- **Remediation card** — one deterministic action per low-survival task, from a fixed four-rule engine. No LLM call.

Corpus: 6 Bob tasks across 3 workspaces — 2 in this repo's `bob_sessions/`, 3 in `tools/fixtures/repo-a/` (workspace `bobtest`), 1 in `tools/fixtures/repo-b/` (`bobtest2`). All six are real redacted Bob exports, not synthetic scaffolding: `tools/fixtures/` is the dataset, and the repo's own test suite happens to run against it too. Live figures — coins, survival, token counts — come from `public/analysis.json`, which is where you should read them rather than from this file.

## Where a human threw Bob's work away

In the `bobtest` workspace, commit `2d6bacb` ("B: docstring on add (by Bob)") is followed immediately by `8e8b929` ("C: human rewrites Bob's docstring"). Bob task `d0259633…` was paid **0.285058 coins**, its output was approved, and a human overwrote it one commit later. Nothing failed. No error was raised anywhere. The coins were spent, the work landed, and it was gone by the next commit.

This is the single most useful row in the dataset, and it is why the survival column exists.

It is a different failure from a task that never reached a commit at all. A throwaway spike — Bob asked to try something, output never committed — has no commit to join against and shows as unjoined. Discarded work *did* land and *was* then replaced. Receipts keeps the two apart; conflating them would let "we never meant to keep it" absorb "a human rejected it after paying for it."

## What Bob measures about skills, and discards

Decoding Bob's own `extension.js` gives the formula it uses for the skills line of the context breakdown:

```
breakdown.skills = tokens(systemPrompt.skills) + sum(loadedSkills)
```

The first term is the whole skills *catalog*, injected into the system prompt every task. The second is the skills the agent actually loaded. In all 6 exports, `loadedSkills` is an empty array — so every skill token counted is catalog, none of it is a skill the agent chose.

That is confirmed independently in the same exports: `costs.contextWindowBreakdown.key` ends in `|5381` in all six. 5381 is the djb2 hash of the empty string — the fingerprint of "no skill was ever loaded." Anyone holding the file can reproduce it.

Measured across the corpus: **451,846 tokens of skill definitions resent across 24 turns / 6 tasks, with `loadedSkills` empty every time.**

Injecting the catalog up front is a design decision, not a bug — an agent cannot pick a skill it has not been shown. The point is not that the tokens are wasted. The point is that Bob measures this to the token and then discards the measurement. Receipts is the panel that reads it.

## How the survival join works

Bob's export never carries a `gitSha` — it is `null` on every task here. So Receipts joins on a time window plus line authorship instead of a hash:

1. Take the task's `updatedAt` (ms epoch) from the export.
2. Find the first git commit whose author time is at or after `updatedAt`. That is the task's commit.
3. Read every file path the task actually wrote, from the tool-call messages in the same export where the tool was `apply_diff`, `write_file`, `insert_content`, or `search_and_replace` and the call did not error.
4. Normalize path separators. The export uses Windows backslashes, git uses forward slashes; skip this and every file silently fails to match and reads 0% for the wrong reason.
5. For each file, check whether the lines that task wrote are still present at HEAD.

Each workspace joins against its own git history. A task is never matched to a commit in a repo it did not run in.

**Known limitation:** a file renamed after the task ran registers as 0% survival even if every line is untouched under the new name. Receipts does not do git rename detection. A moved-and-untouched file looks identical to a deleted one.

## IBM Bob as a core component

Bob is the only input. Receipts accepts nothing else — no arbitrary JSON upload, no manual entry. Take Bob out and the product has zero inputs. The loop is human-in-the-loop in both directions: Bob exports on your command, Receipts measures and emits a remediation prompt, you paste it into Bob, and the next export re-measures.

Bob also built part of this repo, and `bob_sessions/` is the evidence — two complete trios (export JSON, history markdown, consumption-summary screenshot):

```
bob_sessions/receipts_task01_lib_rename_{export.json,history.md,summary.png}
bob_sessions/receipts_task02_lib_jsdoc_{export.json,history.md,summary.png}
```

What Bob did here, factually: task 01 moved `tools/_chk.mjs` to `tools/lib.mjs` (and its test alongside) and fixed three lines in the test file. Task 02 wrote the JSDoc file header on `tools/lib.mjs`. That is 28 lines across two files. The rest of this repo is hand-written; Receipts does not claim otherwise, and the dashboard publishes the per-task authored line count either way.

That is the whole claim about Bob's authorship, and it is deliberately unflattering. The interesting thing is not how much Bob wrote — it is that across 6 tasks in 3 repos its work is instrumented and measured here, including the one case where a human threw it away.

## Run it yourself

```bash
npm ci
npm test
npm run snapshot
npm run dev
```

Other scripts: `npm run build`, `npm run lint`, `npm run check-snapshot`.

## Architecture

`tools/snapshot.mjs` runs locally. It reads the Bob exports in `bob_sessions/` and `tools/fixtures/repo-*/`, plus each workspace's git history, and writes a single `public/analysis.json`, which is committed alongside the code. Vercel serves a static React app that fetches that file. The browser never touches git — no server, no serverless function, nothing to cold-start.

## Troubleshooting

Symptom first.

**`npm test` fails.** The suite is expected green; a red run is a real regression, so read which test failed. One test is a canary over the corpus: it asserts the remediation engine can emit a file-edit candidate, which requires at least one genuinely low-survival task in the dataset. It fails if the corpus loses its discarded-work exemplar (the `d0259633…` / `8e8b929` case) or if the remediation rules stop matching it — i.e. it fails when the dataset or the engine changed, not when the build is broken.

**The page says "Could not load analysis.json".** `public/analysis.json` is not in the deployed build. It is a committed artifact, not a build step — Vercel clones shallow, so generating it there would produce different, plausible, wrong numbers with no error.

```bash
npm run snapshot        # regenerate locally
npm run check-snapshot  # refuses a stale, shallow-generated or unscanned file
```

Then commit the refreshed file and redeploy.

**The page says "analysis.json is missing or mistyped: …".** A field was renamed on one side of the contract and not the other — `tools/snapshot.mjs` writes it, `src/types.ts` and the cards read it. The message names the field. Re-run `npm run snapshot` and reload; if it comes back, both sides need the rename.

**Every task shows 0% survival, or the summary says "no task joined a commit".** The join found nothing. Two causes, likeliest first: a workspace's exports were joined against the wrong repo (the join matches on workspace path, so a moved or missing sibling checkout breaks it), or the clone is shallow, so `git log` sees a truncated history and `git blame` attributes lines at the graft boundary.

```bash
git rev-parse --is-shallow-repository   # must print false
git fetch --unshallow                   # if it printed true
```

`npm run check-snapshot` refuses a snapshot generated from a shallow clone for this reason, rather than letting wrong numbers through quietly.

**`npm run snapshot` exits with `SECRET SCAN FAILED` or `REFUSED: … contains the Windows username`.** An unredacted Bob export reached the pipeline. `public/analysis.json` is committed to a public repo, so the write is refused rather than sanitised silently. Redact the export, then re-run `npm run snapshot`. If the scan names a credential, treat it as live and revoke it first. The matched text is deliberately never printed — open the file at the reported offset yourself.

## What this is not

- **Not a backend.** `public/analysis.json` is a static file; there is nothing else to run. No database, no auth.
- **Not an API integration.** Export and paste are manual by design.
- **Not LLM-powered.** The remediation card is a fixed four-rule engine — reproducible and free, not a placeholder for something smarter.
- **Not a performance metric.** A rename tanks a good task's score and a deliberate throwaway spike tanks it further, and neither means anyone did anything wrong. The number is a prompt to go look at a diff, not a verdict.
- **Not an indictment of Bob.** The skills-catalog injection is by design and the discarded docstring was a human's call. Receipts reports what Bob already measured; it does not claim anyone erred.
- **Not a large corpus.** 6 tasks, 3 repos, one person. The join logic is tested against real data; the dataset is not big enough to claim it generalizes.

## Licence

MIT. See [`LICENSE`](LICENSE).
