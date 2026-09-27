# Receipts

Receipts reads IBM Bob's exported task-session JSON and shows, per task, what was spent, whether that task's code is still in the repo, and where the context budget went. Live at https://receipts-black-five.vercel.app — repo at https://github.com/ishal1410/receipts.

## Why

Both Bob task exports in this repo report `contextWindowBreakdown.skills = 18,572` tokens of loaded skill definitions, in the same export where `contextWindowBreakdown.loadedSkills` is an empty array. Out of a 29,711-token measured baseline, that is 62.5% of the context spent before the agent reads a prompt, on skills it does not say it loaded.

That gap is quiet. It is not an error and not a slow response — it is coins and context spent on nothing narratable. Receipts puts a number on it, and on the harder question next to it: when a human approves an AI-authored change, does it stay in the codebase?

## What it shows

Four panels over one dataset:

- **Task table** — every Bob task in this build, its cost in Bobcoins, and a survival verdict for the code it wrote.
- **Survival chart** — cost plotted against survival, so an expensive task that did not stick is visible at a glance.
- **Context panel** — where each task's context went, by category (skills, tool definitions, project rules, the rest).
- **Remediation card** — one deterministic action per low-survival task, from a fixed four-rule engine. No LLM call.

Current corpus: 2 tasks, 0.895364 Bobcoins, 28 of 28 authored lines surviving at HEAD (100%).

## How the survival join works

Bob's export never carries a `gitSha` — it is `null` on every task here. So Receipts joins on a time window plus line authorship instead of a hash:

1. Take the task's `updatedAt` (ms epoch) from the export.
2. Find the first git commit whose author time is at or after `updatedAt`. That is the task's commit.
3. Read every file path the task actually wrote, from the tool-call messages in the same export where the tool was `apply_diff`, `write_file`, `insert_content`, or `search_and_replace` and the call did not error.
4. Normalize path separators. The export uses Windows backslashes, git uses forward slashes; skip this and every file silently fails to match and reads 0% for the wrong reason.
5. For each file, check whether the lines that task wrote are still present at HEAD.

**Known limitation:** a file renamed after the task ran registers as 0% survival even if every line is untouched under the new name. Receipts does not do git rename detection. A moved-and-untouched file looks identical to a deleted one.

## IBM Bob as a core component

Bob is the only input. Receipts accepts nothing else — no arbitrary JSON upload, no manual entry. Take Bob out and the product has zero inputs. The loop is human-in-the-loop in both directions: Bob exports on your command, Receipts measures and emits a remediation prompt, you paste it into Bob, and the next export re-measures.

Bob also built part of it, and `bob_sessions/` is the evidence — two complete trios (export JSON, history markdown, consumption-summary screenshot):

```
bob_sessions/receipts_task01_lib_rename_{export.json,history.md,summary.png}
bob_sessions/receipts_task02_lib_jsdoc_{export.json,history.md,summary.png}
```

What Bob did, factually: task 01 moved `tools/_chk.mjs` to `tools/lib.mjs` (and its test alongside) and fixed three lines in the test file. Task 02 wrote the JSDoc file header on `tools/lib.mjs`. That is 28 lines across two files. The rest of the repo is hand-written; Receipts does not claim otherwise.

## Run it yourself

```bash
npm ci
npm test          # currently RED on purpose — see Troubleshooting
npm run snapshot
npm run dev
```

Other scripts: `npm run build`, `npm run lint`, `npm run check-snapshot`.

## Architecture

`tools/snapshot.mjs` runs locally. It reads `bob_sessions/*.json` plus the repo's own git history and writes a single `public/analysis.json`, which is committed alongside the code. Vercel serves a static React app that fetches that file. The browser never touches git — no server, no serverless function, nothing to cold-start.

## Troubleshooting

Symptom first.

**`npm test` fails and the build looks broken.** It is not. One canary test asserts the remediation engine can emit a file-edit candidate, and it cannot until a deliberate 0%-survival exemplar exists in the corpus. Every task in the current corpus survives at 100%, so the canary has nothing to fire on and fails by design. It stays red until that exemplar is added. All other tests pass.

**The page says "Could not load analysis.json".** `public/analysis.json` is not in the deployed build. It is a committed artifact, not a build step — Vercel clones shallow, so generating it there would produce different, plausible, wrong numbers with no error.

```bash
npm run snapshot        # regenerate locally
npm run check-snapshot  # refuses a stale, shallow-generated or unscanned file
```

Then commit the refreshed file and redeploy.

**The page says "analysis.json is missing or mistyped: …".** A field was renamed on one side of the contract and not the other — `tools/snapshot.mjs` writes it, `src/types.ts` and the cards read it. The message names the field. Re-run `npm run snapshot` and reload; if it comes back, both sides need the rename.

**Every task shows 0% survival, or the summary says "no task joined a commit".** The join found nothing. Two causes, likeliest first: the exports were taken in a different workspace than the repo you are running in (the join matches on workspace path), or the clone is shallow, so `git log` sees a truncated history and `git blame` attributes lines at the graft boundary.

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
- **Not a large corpus.** 2 tasks, one build, one person. The join logic is tested against real data; the dataset is not big enough to claim it generalizes.
- **Not multi-repo.** One repo, one `bob_sessions/`, one git history to join against.

## Licence

MIT. See [`LICENSE`](LICENSE).
