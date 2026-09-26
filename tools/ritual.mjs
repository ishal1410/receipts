#!/usr/bin/env node
// The export ritual as ONE command with a failing check in front of it.
//
//   node tools/ritual.mjs [workspace-root] --team=<slug> --slug=<short_slug> [--no-commit] [--stage-png]
//   node tools/ritual.mjs --selfcheck            run the sandbox check, touch nothing real
//
// Refuses unless every bob-task-* export at the root has the .json AND a
// matching .png screenshot. A .md is OPTIONAL: if one is there it is redacted,
// renamed and filed exactly like the rest. Then redacts, RENAMES to the
// organiser convention, moves into bob_sessions/, stages EXPLICIT paths and
// commits.
//
// THE .png IS FILED BUT NOT COMMITTED, and .gitignore ignores it. This is the
// one deliberate asymmetry in the ritual, and it is not laziness:
// redactFile() scrubs TEXT. It cannot read PIXELS. A screenshot can carry an
// account name, an email, a C:\Users\<you> path, a private branch name or a
// desktop notification, and a commit to a public repo is IRREVERSIBLE — a
// force-push clears neither forks nor IBM's scanner. An earlier version of this
// file printed "EYEBALL this before it goes public" and then called git in the
// very next statement of the same process: the human was never given a moment
// in which to look, so the warning was decoration. Now the run ENDS with the
// exact `git add -f` line to paste once you actually have looked.
// Pass --stage-png to opt back into one-shot behaviour (it force-adds past the
// ignore rule) when you have already reviewed the shot.
// The backstop if you forget: Task 14 Step 1 counts .png with `git ls-files`,
// so an unreviewed screenshot shows up as a count mismatch while you are awake,
// not as a leak after submission.
//
// Why .md is optional (verified 2026-09-25 against the saved guide at
// docs/ref/bob-hackathon-guide.html): that guide contains ZERO occurrences of
// "export", "markdown", "task history" or "More Actions". Its four `history`
// hits are all `history.pushState` in the page's own JavaScript. What it
// actually asks for is only the screenshot:
//   "Create a folder named bob_sessions in your project submission code
//    repository." ... "Upload all task session consumption summary screenshots
//    to the bob_sessions folder in your code repository."
// An earlier version of this header quoted a markdown-export step that is not
// in the guide we hold, and no .md has ever been produced by Bob on this
// machine. Requiring one refused every task and left bob_sessions/ empty —
// which is both the graded deliverable and this app's input.
//
// So: .png is MANDATORY (the only artifact the guide grades, and a task with no
// screenshot cannot be recovered later — Bob exports only the CURRENT task).
// .json is MANDATORY (it is OUR OWN input format for the app; the guide never
// asks for it, but without it there is no product). .md is a bonus if the IDE
// ever offers it.
//
// Refuses to file more than one task per run: batching this at hour 44 is the
// documented way people lose the deliverable ("Do this as you go, not at 11 PM
// on Sunday!").
//
// `git add -A` is never used: that is the path that sweeps an unredacted export
// (or a .env) into immutable public history.

import { globSync, mkdirSync, renameSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { redactFile, containsUser, currentUser, assertNoSecrets } from "./redact.mjs";

const DEST = "bob_sessions";

// Organiser's naming example, verbatim: teamalpha_task01_login_flow_summary.png
// -> <team>_task<NN>_<slug>_<role>.<ext>, NN zero-padded. One shared base per
// task so the screenshot and its history file are obviously a pair.
const ROLE = { png: "summary", md: "history", json: "export" };
// .md is the only optional one — see the header. Order is the filing order.
const EXTS = ["json", "md", "png"];
const REQUIRED = ["json", "png"];
const TEXT = ["json", "md"]; // redactable; .png is pixels, see the EYEBALL note
const SLUG_RX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function bobName(team, n, slug, ext) {
  return `${team}_task${String(n).padStart(2, "0")}_${slug}_${ROLE[ext]}.${ext}`;
}

/** Next free task number: 1 + the highest NN already filed in bob_sessions/. */
export function nextTaskNo(dest) {
  if (!existsSync(dest)) return 1;
  let max = 0;
  for (const f of globSync("*_task*_*_summary.png", { cwd: dest })) {
    const m = /_task(\d+)_/.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** Group root-level bob-task-* files by stem and say which receipt is missing. */
export function survey(root) {
  const stems = new Map(); // stem -> {json,md,png}
  for (const f of globSync("bob-task-*", { cwd: root })) {
    const ext = path.extname(f).slice(1).toLowerCase();
    if (!EXTS.includes(ext)) continue;
    const stem = f.slice(0, -(ext.length + 1));
    const e = stems.get(stem) ?? {};
    e[ext] = f;
    stems.set(stem, e);
  }
  const complete = [], incomplete = [];
  for (const [stem, e] of stems) {
    const missing = REQUIRED.filter((k) => !e[k]);
    (missing.length ? incomplete : complete).push({ stem, files: e, missing });
  }
  return { complete, incomplete };
}

export function ritual(root, { commit = true, stagePng = false, log = console.log, team = process.env.BOB_TEAM, slug, stem } = {}) {
  let { complete, incomplete } = survey(root);
  if (stem) {
    complete = complete.filter((c) => c.stem === stem);
    incomplete = incomplete.filter((c) => c.stem === stem);
  }

  if (!complete.length && !incomplete.length) throw new Error(`no bob-task-* export found in ${root}`);
  if (incomplete.length) {
    const why = incomplete.map((s) => `  ${s.stem} is missing: ${s.missing.map((m) => "." + m).join(" ")}`).join("\n");
    throw new Error(
      `REFUSED, receipts incomplete (Bob can only export the CURRENT task, so fix this now):\n${why}\n` +
      `  .png = screenshot the task session consumption summary (click the task header in Bob's Tasks/History view).`
    );
  }
  if (complete.length > 1)
    throw new Error(
      `REFUSED, ${complete.length} tasks pending — file them ONE AT A TIME, as you go:\n` +
      complete.map((c) => `  node tools/ritual.mjs --stem=${c.stem} --slug=<short_slug>`).join("\n")
    );
  if (!team || !SLUG_RX.test(team))
    throw new Error(`REFUSED, need --team=<lablab_team_slug> (or BOB_TEAM), lowercase a-z0-9_ — got ${JSON.stringify(team ?? null)}`);
  if (!slug || !SLUG_RX.test(slug))
    throw new Error(`REFUSED, need --slug=<short_slug> naming this task, lowercase a-z0-9_ (e.g. --slug=login_flow)`);

  const dest = path.join(root, DEST);
  mkdirSync(dest, { recursive: true });
  const user = currentUser();
  // filed = everything moved into bob_sessions/. staged = what git is told about.
  // They differ by the .png unless --stage-png; see the header.
  const filed = [];
  const staged = [];
  const pendingPng = [];

  // ponytail: this loop is not transactional. If stem 2 throws, stem 1 is already
  // moved into bob_sessions/. That is not a leak — git is only called AFTER the
  // whole loop, so a throw anywhere means nothing was staged and nothing was
  // committed. Ceiling: you re-run after fixing and the moved files are picked up
  // from their new home. Upgrade path: stage to a temp dir first, if that ever bites.
  const n = nextTaskNo(dest);
  for (const { stem, files } of complete) {
    // Only what this task actually has: .md may legitimately be absent.
    const have = EXTS.filter((e) => files[e]);
    const text = have.filter((e) => TEXT.includes(e));
    for (const ext of text) redactFile(path.join(root, files[ext]), user);
    for (const ext of have) {
      const to = path.join(dest, bobName(team, n, slug, ext));
      renameSync(path.join(root, files[ext]), to);
      const rel = `${DEST}/${bobName(team, n, slug, ext)}`;
      filed.push(rel);
      if (ext === "png" && !stagePng) pendingPng.push(rel);
      else staged.push(rel);
    }
    // last gate: re-read what is actually on disk in bob_sessions/ and refuse to
    // reach `git` if it still carries the username OR anything credential-shaped.
    // redactFile already threw on both above; this repeats it against the MOVED
    // bytes so the check sits between the rename and the only call to git.
    for (const ext of text) {
      const p = path.join(dest, bobName(team, n, slug, ext));
      const body = readFileSync(p, "utf8"); // not `text` — that is the ext list above
      if (containsUser(body, user)) throw new Error(`ABORT before git: ${p} still contains the username`);
      assertNoSecrets(body, `ABORT before git: ${p}`);
    }
    log(`receipts ok  ${stem} -> ${bobName(team, n, slug, "png")}  (${text.join("+")} redacted, png filed${files.md ? "" : ", no .md — optional"})`);
  }

  // redact.mjs scrubs TEXT. It cannot scrub PIXELS, and this repo is public.
  // ponytail: a printed line, not OCR. The human is standing right here.
  log(`\n  EYEBALL ${DEST}/${bobName(team, n, slug, "png")} BEFORE IT GOES PUBLIC:`);
  log(`  account name/email, C:\\Users\\<you> paths, private repo or branch names,`);
  log(`  other tasks in the side panel, desktop notifications. Crop or retake, do not commit blind.`);
  if (pendingPng.length) {
    // The whole point of the split: this run does NOT commit the pixels, so the
    // line above is a real gate instead of a caption on an already-public file.
    log(`\n  NOT COMMITTED (and gitignored) until you have looked:`);
    for (const p of pendingPng) log(`    ${p}`);
    log(`  When it is clean, paste this:`);
    log(`    git add -f ${pendingPng.join(" ")} && git commit -m "receipts: task${String(n).padStart(2, "0")} ${slug} screenshot"`);
    log(`  If you forget, Task 14 Step 1 catches it: the .png count from`);
    log(`  \`git ls-files ${DEST} | grep -c '_summary\\.png$'\` must equal the .json count.`);
  }

  const msg = `receipts: task${String(n).padStart(2, "0")} ${slug}`;
  // -f only when the caller asked for the .png, because .gitignore ignores it.
  // Without --stage-png nothing here is ignored, so no -f and no way for this
  // call to force anything past the ignore rules by accident.
  const add = stagePng ? ["add", "-f", "--", ...staged] : ["add", "--", ...staged];
  const argv = [add, ["commit", "-m", msg, "--", ...staged]];
  if (!commit) {
    log(`[--no-commit] would run:\n  git ${argv[0].join(" ")}\n  git commit -m ${JSON.stringify(msg)} -- ...`);
    return { filed, staged, pendingPng, argv, committed: false };
  }
  for (const a of argv) execFileSync("git", a, { cwd: root, stdio: "inherit" });
  log(`committed ${staged.length} file(s)`);
  return { filed, staged, pendingPng, argv, committed: true };
}

// --- the one runnable check -------------------------------------------------
// Sandbox with a fake export. Proves the guard fires on a missing screenshot
// and on a missing .json, that a complete trio lands redacted in bob_sessions/,
// that png+json with NO .md also files (the real case — Bob has never produced
// an .md on this machine), and that staging is by explicit path. No git, no
// real files.
function selfcheck() {
  const user = currentUser();
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bob-ritual-"));
  const stem = "bob-task-deadbeef-2026-09-25";
  const fake = {
    version: 1, workspace: `file:c:\\Users\\${user}\\demo`,
    tasks: [{
      task: { id: "deadbeef", workspace: `file:c:\\Users\\${user}\\demo`, costs: { cost: 1.5 },
        env: { workspace: `c:\\Users\\${user}\\demo`, staticEnvInfo: { primaryWorkspace: `c:\\Users\\${user}\\demo`,
          systemInfo: { platform: "win32", release: "10.0.26200", arch: "x64", shell: "powershell.exe" } } } },
      messages: [{ id: "m1", role: "assistant", data: { role: "assistant", content: "edited a.py",
        toolUsage: { signature: { name: "apply_diff", arguments: { path: "a.py" } }, permission: "edit" },
        _meta: { timestamp: 1, changes: { [`file:///c%3A/Users/${user}/demo/a.py`]: { before: "x\n", after: "y\n", patch: `Index: file:///c%3A/Users/${user}/demo/a.py\n` } } } } }],
    }],
  };
  const TEAM = "receipts", SLUG = "login_flow";
  const ok = (cond, what) => { if (!cond) throw new Error(`FAIL: ${what}`); };
  const json = (s) => writeFileSync(path.join(tmp, s + ".json"), JSON.stringify(fake), "utf8");
  const md = (s) => writeFileSync(path.join(tmp, s + ".md"), `# task\nran in c:\\Users\\${user}\\demo\n`, "utf8");
  const write = (s) => { json(s); md(s); };
  const shot = (s) => writeFileSync(path.join(tmp, s + ".png"), "\x89PNG\r\n");
  const run = (o) => ritual(tmp, { commit: false, log: () => {}, team: TEAM, slug: SLUG, ...o });
  const refuses = (o) => { try { run(o); } catch (e) { return e.message; } return ""; };

  // 1. no screenshot -> refuse, and leave the export where it was.
  // This is the deliverable guard: the summary screenshot is not optional.
  write(stem);
  let refused = refuses({});
  ok(/REFUSED/.test(refused) && /\.png/.test(refused), `missing .png was not refused (got: ${refused || "no error"})`);
  ok(existsSync(path.join(tmp, stem + ".json")), "refused run moved files anyway");
  ok(!/\.md/.test(refused), `the .md was listed as missing, but it is present: ${refused}`);
  console.log("ok  refuses without a matching .png, files untouched");

  // 1b. .json is still mandatory: it is this app's input format.
  const jsonless = "bob-task-nojson-2026-09-25";
  md(jsonless); shot(jsonless);
  refused = refuses({ stem: jsonless });
  ok(/REFUSED/.test(refused) && /\.json/.test(refused), `missing .json was not refused (got: ${refused || "no error"})`);
  rmSync(path.join(tmp, jsonless + ".md")); rmSync(path.join(tmp, jsonless + ".png"));
  console.log("ok  refuses without the .json");

  // 2. the organiser name cannot be guessed -> team and slug are mandatory
  shot(stem);
  ok(/REFUSED/.test(refuses({ team: "" })) , "empty --team was not refused");
  ok(/--team/.test(refuses({ team: "" })), "team refusal does not name --team");
  ok(/--slug/.test(refuses({ slug: undefined })), "missing --slug was not refused");
  ok(/--slug/.test(refuses({ slug: "Login Flow" })), "a slug with spaces/caps was accepted");
  console.log("ok  refuses without --team / a valid --slug");

  // 3. batching is refused: one task per run, as you go
  const stem2 = "bob-task-cafebabe-2026-09-26";
  write(stem2); shot(stem2);
  refused = refuses({});
  ok(/REFUSED/.test(refused) && /ONE AT A TIME/.test(refused), `batching 2 tasks was not refused (got: ${refused || "no error"})`);
  console.log("ok  refuses to file 2 tasks in one run");

  // 4. one task -> redacted, renamed to the organiser convention, explicit staging
  const r = run({ stem });
  const base = `${TEAM}_task01_${SLUG}`;
  const moved = (e) => path.join(tmp, DEST, `${base}_${ROLE[e]}.${e}`);
  for (const e of ["json", "md", "png"]) {
    ok(existsSync(moved(e)), `.${e} not filed as ${base}_${ROLE[e]}.${e}`);
    ok(!existsSync(path.join(tmp, stem + "." + e)), `.${e} left at workspace root`);
  }
  ok(existsSync(moved("png")) && path.basename(moved("png")) === "receipts_task01_login_flow_summary.png",
     "screenshot name does not match the organiser example shape");
  const out = readFileSync(moved("json"), "utf8");
  ok(!containsUser(out, user), "username survived into bob_sessions/");
  ok(!containsUser(readFileSync(moved("md"), "utf8"), user), "username survived in the .md");
  const j = JSON.parse(out);
  const ch = j.tasks[0].messages[0].data._meta.changes;
  ok(Object.keys(ch).length === 1, "change entry lost");
  ok(Object.values(ch)[0].before === "x\n" && Object.values(ch)[0].after === "y\n", "change payload altered");
  ok(j.tasks[0].messages[0].data.toolUsage.permission === "edit", "toolUsage.permission lost");
  ok(j.tasks[0].task.env.staticEnvInfo.systemInfo.release === "redacted", "systemInfo not scrubbed");
  ok(!r.argv.some((a) => a.includes("-A") || a.includes("--all")), "staging used a wildcard add");
  ok(r.argv[0].join(" ") === `add -- ${DEST}/${base}_export.json ${DEST}/${base}_history.md`,
     `unexpected git add argv: ${r.argv[0].join(" ")}`);
  console.log("ok  trio redacted, renamed, text staged as explicit paths");
  console.log(`    git ${r.argv[0].join(" ")}`);

  // 4b. THE POINT OF THE SPLIT: the .png is on disk but git was never told.
  //     Regression guard for the old behaviour, where "EYEBALL this" printed and
  //     the commit happened in the same process, leaving nothing to review.
  ok(existsSync(moved("png")), "png was not filed to disk");
  ok(r.filed.includes(`${DEST}/${base}_summary.png`), "png missing from filed[]");
  ok(!r.staged.includes(`${DEST}/${base}_summary.png`), "png was staged without review");
  ok(r.pendingPng.join(" ") === `${DEST}/${base}_summary.png`,
     `pendingPng wrong: ${r.pendingPng.join(" ")}`);
  ok(!r.argv[0].join(" ").includes(".png"), "a .png reached git add");
  ok(!r.argv[1].join(" ").includes(".png"), "a .png reached git commit");
  ok(!r.argv[0].includes("-f"), "-f used on a run that stages nothing ignored");
  console.log("ok  png filed but NOT staged, and named in pendingPng");

  // 4c. --stage-png opts back in, and must force past the .gitignore rule.
  // Its own fixture, and an explicit --stem: stem2 from case 3 is still pending,
  // so without the stem this run would trip the ONE AT A TIME guard (and it would
  // eat the fixture case 5 needs to prove auto-numbering).
  const stemP = "bob-task-eyeball-2026-09-26";
  write(stemP); shot(stemP);
  const rp = run({ slug: "eyeballed", stagePng: true, stem: stemP });
  const basep = `${TEAM}_task02_eyeballed`;
  ok(rp.staged.includes(`${DEST}/${basep}_summary.png`), "--stage-png did not stage the png");
  ok(rp.pendingPng.length === 0, "--stage-png still left a pending png");
  ok(rp.argv[0][1] === "-f", `--stage-png must force past .gitignore: ${rp.argv[0].join(" ")}`);
  console.log("ok  --stage-png stages the png with -f");

  // 5. the next task numbers itself 02 off what is already filed
  const r2 = run({ slug: "parser_fix" });
  ok(r2.filed.includes(`${DEST}/${TEAM}_task03_parser_fix_summary.png`),
     `third task did not number itself 03: ${r2.filed.join(" ")}`);
  console.log(`ok  next task auto-numbers: ${TEAM}_task03_parser_fix_summary.png`);

  // 6. THE REAL CASE: .png + .json, no .md at all. Bob has never produced an .md
  //    on this machine and the saved guide never asks for one. This must FILE,
  //    not refuse — a refusal here leaves bob_sessions/ empty, and that folder is
  //    both the graded deliverable and this app's input.
  const tmp2 = mkdtempSync(path.join(os.tmpdir(), "bob-ritual-nomd-"));
  const stem3 = "bob-task-facefeed-2026-09-27";
  writeFileSync(path.join(tmp2, stem3 + ".json"), JSON.stringify(fake), "utf8");
  writeFileSync(path.join(tmp2, stem3 + ".png"), "\x89PNG\r\n");
  const r3 = ritual(tmp2, { commit: false, log: () => {}, team: TEAM, slug: "no_md" });
  const base3 = `${TEAM}_task01_no_md`;
  ok(existsSync(path.join(tmp2, DEST, `${base3}_export.json`)), "json not filed in the no-.md case");
  ok(existsSync(path.join(tmp2, DEST, `${base3}_summary.png`)), "png not filed in the no-.md case");
  ok(!existsSync(path.join(tmp2, DEST, `${base3}_history.md`)), "an .md appeared out of nowhere");
  ok(r3.filed.length === 2, `no-.md run filed ${r3.filed.length} paths, expected 2: ${r3.filed.join(" ")}`);
  ok(r3.staged.length === 1, `no-.md run staged ${r3.staged.length} paths, expected 1 (.json only): ${r3.staged.join(" ")}`);
  ok(!containsUser(readFileSync(path.join(tmp2, DEST, `${base3}_export.json`), "utf8"), user),
     "username survived into bob_sessions/ in the no-.md case");
  ok(!r3.argv.some((a) => a.includes("-A") || a.includes("--all")), "no-.md run used a wildcard add");
  ok(r3.argv[0].join(" ") === `add -- ${DEST}/${base3}_export.json`,
     `unexpected git add argv (no .md): ${r3.argv[0].join(" ")}`);
  ok(r3.pendingPng.join(" ") === `${DEST}/${base3}_summary.png`,
     `no-.md run lost the pending png: ${r3.pendingPng.join(" ")}`);
  console.log("ok  png+json with NO .md files anyway, redacted, json staged, png pending");
  console.log(`    git ${r3.argv[0].join(" ")}`);
  rmSync(tmp2, { recursive: true, force: true });

  rmSync(tmp, { recursive: true, force: true });
  console.log("\nselfcheck PASSED");
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  try {
    const flag = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
    if (args.includes("--selfcheck")) selfcheck();
    else ritual(args.find((a) => !a.startsWith("--")) ?? process.cwd(), {
      commit: !args.includes("--no-commit"),
      stagePng: args.includes("--stage-png"),
      team: flag("team"), slug: flag("slug"), stem: flag("stem"),
    });
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
