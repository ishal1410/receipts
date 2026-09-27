# Receipts

Receipts reads IBM Bob's exported task-session JSON and shows, per task, what was spent, whether that task's code is still in the repo, and where the context budget went. Live at https://receipts-black-five.vercel.app — [deck](https://receipts-black-five.vercel.app/receipts-deck.pdf) — repo at https://github.com/ishal1410/receipts.

## Why

Bob already measures its own cost precisely — per task, per turn, per context category — and then drops the measurement on the floor when the task closes. Receipts is the panel that reads it.

Two things become visible once you read it. First, where the context budget actually goes before the agent sees a prompt. Second, the harder question next to it: when a human approves an AI-authored change, does it stay in the codebase? Sometimes it does not, and that case is in the corpus.

## What it shows

The page in section order, every section reading the same committed file:

- **Provenance** — one figure chased through three artifacts: `0.469` in Bob's own IDE panel, `0.468592` in the committed export, `0.468592` printed out of `analysis.json` at runtime.
- **The finding** — how much of each session's context window went to skill definitions before the operator typed a word.
- **The ledger** — every session joined to the commit it produced. Expand a row for the files, the commit and the window; where no join was possible, the reason is stated rather than left as a zero to be misread as "wrote nothing".
- **Paid for, then deleted** — the discarded-work case on its own.
- **The totals** — what the agent cost and what is left of it, drawn as one square per authored line, lit if git blame still credits it to Bob at HEAD.
- **The open item** — the one remediation, as text to paste into Bob. Its closing panel is headed *No loop was closed*, and means it.

Corpus: 6 Bob tasks across 3 workspaces — 2 in this repo's `bob_sessions/`, 3 in `tools/fixtures/repo-a/` (workspace `bobtest`), 1 in `tools/fixtures/repo-b/` (`bobtest2`). All six are real redacted Bob exports, not synthetic scaffolding: `tools/fixtures/` is the dataset, and the repo's own test suite happens to run against it too. Live figures — coins, survival, token counts — come from `public/analysis.json`, which is where you should read them rather than from this file.

## Verify it yourself

Five checks, from a clone, with nothing but Node 24, git and `curl`. None of them needs `npm install`. The first four re-read what is in the repo; the fifth re-derives a verdict from scratch, and it is the one to run if you only run one.

**1. IBM Bob really built part of this repo.** `bob_sessions/` holds, per task, the machine-readable export, Bob's own rendered task report (prompt, turns, tool calls), and a screenshot of the Bob IDE's consumption summary. Both tasks are in this repo's git history:

```bash
ls bob_sessions/
git log --oneline --grep='by Bob'   # ec94423 task02, 4458a40 task01
git show ec94423                    # the JSDoc header Bob wrote, as it landed
```

**2. Two thirds of the context window is a skills catalog the operator never asked for.** One command, all six exports:

```bash
node -e "for(const f of process.argv.slice(1)){const{tasks}=require('./'+f);for(const w of tasks){const c=(w.task||w).costs.contextWindowBreakdown;console.log(f,c.breakdown.skills+'/'+c.total,(100*c.breakdown.skills/c.total).toFixed(1)+'%','loadedSkills='+JSON.stringify(c.loadedSkills),'key='+c.key.split('|').pop())}}" bob_sessions/*_export.json tools/fixtures/repo-*/*.json
```

Six lines out, one per task. `loadedSkills=[]` and `key=5381` every time — 5381 is the djb2 hash of the empty string, so the catalog was injected and nothing was ever loaded from it. The skills share runs 62.5% to 63.4%: 18,572 tokens of a 29,711-token window in this repo, 19,009 of 29,977 in the sibling workspaces. It is not byte-identical across tasks, which is what a measurement looks like rather than a number someone typed.

**3. A human threw away work Bob was paid for.**

```bash
node -e "for(const t of require('./public/analysis.json').tasks)console.log(t.id.slice(0,8),t.workspace,t.coins,'authored='+t.authored,'survived='+t.survived,'commit='+(t.commit?t.commit.short:'none'))"
grep -o 'Return the sum of a and b' tools/fixtures/repo-a/*d0259633*.json
```

Task `d0259633` cost 0.285058 coins, wrote 1 line, joined commit `2d6bacb`, and 0 of that line survives. The second command prints the docstring it wrote, straight out of the `apply_diff` tool call in the export.

Both commands read committed files. Check 5 re-derives the same verdict without trusting either.

**4. The dashboard is generated, not hand-written.** Add up `costs.cost` across the six raw exports and compare it with the headline total the page renders:

```bash
node -e "let s=0;for(const f of process.argv.slice(1))for(const w of require('./'+f).tasks)s+=(w.task||w).costs.cost;console.log('sum of costs.cost in the exports:',s.toFixed(6),'| analysis.json totals.coins:',require('./public/analysis.json').totals.coins)" bob_sessions/*_export.json tools/fixtures/repo-*/*.json
curl -s https://receipts-black-five.vercel.app/analysis.json | diff - public/analysis.json
```

Both sides print `1.894928` — the headline total is summed out of the raw exports, not typed into a file. The second command compares the deployed file against the committed one: they are the same artifact, so an empty `diff` means the live page is serving exactly what you can read here, and a non-empty one means a deploy is lagging a commit, which is worth knowing before you quote a figure off the page. `public/analysis.json` also carries its own provenance — `generatedAt`, and a `_generatedIn` block with the head SHA, commit count and shallow-clone flag of the repo it was built from. `npm run check-snapshot` is the gate that reads that block and refuses a snapshot older than its inputs or built from a shallow clone.

**5. The discarded-work verdict reproduces from scratch.** The `bobtest` and `bobtest2` git histories are local checkouts, not part of this repo — so `tools/fixtures/history.json` carries the data to rebuild them, and `tools/replay.mjs` does:

```bash
node tools/replay.mjs   # or: npm run replay
```

It builds both sibling workspaces in a temp directory from that checked-in data — no repo outside the clone, no network, Node stdlib only, so it runs before `npm ci` and cleans up after itself — then re-runs the dashboard's own join over them, re-derives the R2 remediation, and diffs the result against committed `public/analysis.json`, exiting non-zero on any disagreement. It currently exits 0: *the rebuild AGREES with public/analysis.json on all 4 fixture-backed task(s) — lines authored, lines surviving at HEAD, survival %, and which commit overwrote the work.*

Two limits, which the command prints for itself:

- **The SHAs differ, deliberately.** A sha hashes content plus author plus time, and the real commits are authored under a Windows username that must not be published, so the replay commits under a neutral fixture author. Contents, messages and committer timestamps are identical. What reproduces is the *verdict*, not the hash; each row prints its rebuilt sha beside the one the dashboard cites.
- **It attests to 4 of the 6 tasks.** The two `receipts` tasks are excluded because they join against this repo's own history, which you already have — checks 1 and 3 cover those.

## Where a human threw Bob's work away

In the `bobtest` workspace, commit `2d6bacb` ("B: docstring on add (by Bob)") is followed immediately by `8e8b929` ("C: human rewrites Bob's docstring"). Bob task `d0259633…` was paid **0.285058 coins**, its output was approved, and a human overwrote it one commit later. Nothing failed and no error was raised anywhere: the coins were spent, the work landed, and it was gone by the next commit. That one row is why the survival column exists, and it is the only remediation the engine emits on this corpus.

**Then it happened to us, mid-build.** Bob's task 02 wrote a 25-line JSDoc header on `tools/lib.mjs`, one line of which read `remediations - Placeholder rule engine; returns an empty array until Task 9.` Implementing that rule engine rewrote the line. Task 02 now measures 24 of 25 surviving and the corpus total fell from 28 of 29 to 27 of 29 — while we were building the thing that measures exactly this, nobody edited a number, and `git blame` moved on its own. That is the difference between a measurement and a figure typed into a slide.

It is a different failure from a task that never reached a commit at all. A throwaway spike — Bob asked to try something, output never committed — has no commit to join against and shows as unjoined. Discarded work *did* land and *was* then replaced. Receipts keeps the two apart; conflating them would let "we never meant to keep it" absorb "a human rejected it after paying for it."

## What Bob measures about skills, and discards

Decoding Bob's own `extension.js` gives the formula it uses for the skills line of the context breakdown:

```
breakdown.skills = tokens(systemPrompt.skills) + sum(loadedSkills)
```

The first term is the whole skills *catalog*, injected into the system prompt every task. The second is the skills the agent actually loaded. In all 6 exports, `loadedSkills` is an empty array — so every skill token counted is catalog, none of it is a skill the agent chose.

The same exports confirm it a second way, independent of the formula: `costs.contextWindowBreakdown.key` ends in `|5381` in all six, and 5381 is the djb2 hash of the empty string. **Verify it yourself**, claim 2, prints both checks in one command.

Measured across the corpus: **451,846 tokens of skill definitions resent across 24 turns / 6 tasks, with `loadedSkills` empty every time.**

Injecting the catalog up front is a design decision, not a bug — an agent cannot pick a skill it has not been shown. The point is not that the tokens are wasted. The point is that Bob measures this to the token, then discards the measurement when the task closes.

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

Bob is the only input. Receipts accepts nothing else — no arbitrary JSON upload, no manual entry. Take Bob out and the product has zero inputs. Export is manual and on your command; Receipts reads what the export already contains and adds nothing of its own.

Bob also built part of this repo, and `bob_sessions/` is the evidence: two complete trios of export JSON, history markdown and consumption-summary screenshot, one per task. What Bob did here, factually: task 01 moved `tools/_chk.mjs` to `tools/lib.mjs` (and its test alongside) and fixed three lines in the test file. Task 02 wrote the JSDoc file header on `tools/lib.mjs`. That is 28 lines across two files, 27 of them still at HEAD in this repo. The rest is hand-written; Receipts does not claim otherwise, and the dashboard publishes the per-task authored line count either way.

That is the whole claim about Bob's authorship, and it is deliberately unflattering. What matters is not how much Bob wrote but that all 6 tasks across 3 repos are instrumented here — including both cases where a human overwrote the work, one of them ours.

## Run it yourself

```bash
npm ci
npm run dev     # serves the committed public/analysis.json
```

Other scripts: `npm run build`, `npm run lint`, `npm test`, `npm run replay`, `npm run check-snapshot`.

**`npm run snapshot` on a fresh clone will shrink the corpus.** The pipeline joins each workspace's exports against that workspace's own git history, and two of the three checkouts exist only on the author's machine. On your clone it skips those pairs — loudly, one `SKIPPED …` line each — and rewrites `public/analysis.json` down to the 2 tasks it can still join. That is the correct behaviour, and it is why the file is committed rather than built at deploy time. `git checkout public/analysis.json` restores the 6-task corpus.

## Architecture

`tools/snapshot.mjs` runs locally. It reads the Bob exports in `bob_sessions/` and `tools/fixtures/repo-*/`, plus each workspace's git history, and writes a single `public/analysis.json`, which is committed alongside the code. Vercel serves a static React app that fetches that file. The browser never touches git — no server, no serverless function, nothing to cold-start.

## Troubleshooting

Symptom first.

**`npm test` fails.** As shipped: 84 pass, 0 fail. A red run is a real regression, so read which test failed. One of them is a canary over the shipped corpus rather than over fixtures: `the remediation engine emits at least one FILE-EDIT candidate for the loop-close` in `tools/lib.test.mjs` asserts that `remediations()` can turn `public/analysis.json` into a prompt naming a real file. It goes red if the corpus loses its discarded-work exemplar or if R2 stops matching it — that is a dataset or engine change, not a broken build, and its assertion message says which.

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
- **Not LLM-powered.** Every number, and the remediation prompt itself, comes from the exports and git; there is no model call anywhere in the pipeline. One rule is implemented — R2, "Bob was paid for lines a human overwrote" — not the four the spec sketches, because R2 is the only one whose fix is a diff Bob can produce; the rest are IDE settings and process advice. It emits exactly one remediation on this corpus, for task `d0259633`.
- **Not an automated loop.** Receipts writes a prompt. It does not send it, run it, or check whether anyone acted on it. The next export is what re-measures, and exporting is your keystroke.
- **Not a performance metric.** A rename tanks a good task's score and a deliberate throwaway spike tanks it further, and neither means anyone did anything wrong. The number is a prompt to go look at a diff, not a verdict.
- **Not an indictment of Bob.** The skills-catalog injection is by design and the discarded docstring was a human's call. Receipts reports what Bob already measured; it does not claim anyone erred.
- **Not a large corpus.** 6 tasks, 3 repos, one person. The join logic is tested against real data; the dataset is not big enough to claim it generalizes.

## Licence

MIT. See [`LICENSE`](LICENSE).
