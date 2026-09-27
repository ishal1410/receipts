import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { Analysis, Remediation } from '../types';

// THE STUB AT THE BOTTOM OF THE RECEIPT. Everything above this panel is measurement;
// this is the only thing on the page an operator can act on, and until now the rule
// engine wrote it into analysis.json and no component read it.
//
// PLACEMENT: last, under Total. A receipt reads finding, then itemised lines, then
// the total, then the part you tear off and keep. Summary's closing sentence already
// says "1 authored line reached a commit and was later replaced by a human"; this
// panel is the answer to the "so what do I do" that sentence provokes, and it reads
// as the next sentence rather than as a second opinion floating above the evidence.
//
// WHAT THIS PANEL MUST NEVER CLAIM: that anything here was run, pasted, sent, or
// acted on. Nothing has been. Receipts emits the text; a human decides. The closing
// line says exactly that, unprompted, because a judge will ask it.
//
// NO ACCENT HUE IN HERE, deliberately. The page's four colours are semantic
// measurements - survived, discarded, coins, context - and a remediation is an
// instruction, not a measurement. Tinting it coral for emphasis would be the same
// move the rest of this product refuses: colouring something that is not a loss as
// one. The panel earns its weight from position and typography instead.

// Sets figures and commit shas in the mono tabular face, the way every other figure
// on this page is set, without which these strings arrive as sans prose among mono
// columns and read as pasted in from somewhere else.
//
// Two alternatives: a token starting with a digit ("0.285058", "1", "2d6bacb"), or a
// 7+ character hex run that contains at least one digit ("bab5d9a"). The lookahead
// is what stops it eating English words built only from a-f: "defaced" is seven
// legal hex characters and no digit, so it stays prose.
//
// ponytail: a regex, not a parser. Ceiling is that a sha of pure letters ("abcdefa")
// stays prose; if rule output ever leans on those, have the engine emit the spans.
const FIG = /(\b\d[\w.]*\b|\b(?=[a-f]*\d)[0-9a-f]{7,}\b)/g;

// Also the shared guard for every string this panel renders. snapshot.mjs is the
// writer and the rule set will grow; a field that arrives missing or renamed must
// drop out of the layout, never throw .split of undefined onto the public URL.
function mono(s: unknown) {
  if (typeof s !== 'string' || s === '') return null;
  return s
    .split(FIG)
    .map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="num">
          {part}
        </span>
      ) : (
        part
      ),
    );
}

function CopyPrompt({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Cleanup is the point: without it a click, then an unmount inside 2.4s, sets
  // state on a dead component. Keying the effect on `state` also means a second
  // click restarts the window instead of stacking timers.
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(t);
  }, [state]);

  // navigator.clipboard is undefined on a plain-http origin and writeText rejects
  // when the permission is denied, so BOTH the access and the call sit inside the
  // try. The failure message can tell the operator to select the text because the
  // prompt is printed in full above it; that is the second reason it is not hidden
  // behind a disclosure.
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const label =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy prompt';

  return (
    <button
      type="button"
      onClick={copy}
      // Radius 0 and a hairline, like every other edge on the page: there is no
      // filled button anywhere in this product and this is not the place to invent
      // one. Ink on paper measures 15.69:1, and 17.36:1 against the hover fill.
      className="border border-[var(--color-line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-raised)] active:translate-y-px"
    >
      <span aria-live="polite">{label}</span>
    </button>
  );
}

function Item({ r }: { r: Remediation }) {
  const prompt = typeof r.prompt === 'string' && r.prompt.trim() !== '' ? r.prompt : null;

  return (
    <li className="min-w-0 p-6 md:p-8">
      <h3 className="max-w-3xl">{mono(r.title)}</h3>
      <p className="num mt-1.5 break-all text-[11px] text-[var(--color-muted)]">
        {[r.rule && `Rule ${r.rule}`, r.file].filter(Boolean).join('  ·  ')}
      </p>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-text-2)]">
        {mono(r.detail)}
      </p>
      <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--color-text)]">
        {mono(r.action)}
      </p>

      {prompt && (
        // The perforation, used at the one place on the page that is literally a
        // tear-off stub. Above the line is what Receipts found; below it is the text
        // you take away.
        <div className="perf">
          {/* Same measure as the block below it. Left to the panel's full width the
              button lands a thousand pixels from the text it copies and stops
              reading as that block's control. */}
          <div className="flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h4 className="text-xs font-semibold text-[var(--color-text)]">
              Task text for Bob
            </h4>
            <CopyPrompt text={prompt} />
          </div>
          {/* PRINTED IN FULL, not behind a disclosure. This text is the whole claim
              that Receipts is a tool and not a report, so hiding it behind a click
              hides the product; the ledger above already owns the show/hide pattern,
              and a second one here would be the same layout twice. Bordered on the
              raised ground, the same treatment the committed Bob export gets in
              Provenance: the input to the tool and the output of it are drawn as the
              same kind of object, at the two ends of the page. */}
          <p className="mt-3 max-w-3xl border border-[var(--color-line)] bg-[var(--color-raised)] p-4 text-[13px] leading-relaxed text-[var(--color-text-2)]">
            {mono(prompt)}
          </p>
        </div>
      )}
    </li>
  );
}

export default function Remediations({ analysis }: { analysis: Analysis }) {
  // Absent, not just empty: a snapshot written before the rule engine has no key at
  // all, and a fresh clone loses the sibling workspaces and with them the only task
  // this corpus has a rule for.
  const list = Array.isArray(analysis.remediations) ? analysis.remediations : [];

  // The empty state has to be able to tell the truth about WHY it is empty, so it is
  // computed rather than asserted. "Nothing was discarded" and "something was
  // discarded and no rule matched it" are different facts and the second one is the
  // one an operator would want to know about.
  const deadLines = Math.max(
    (analysis.totals?.authored ?? 0) - (analysis.totals?.survived ?? 0),
    0,
  );

  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-6 md:p-8">
        <h2>What to do about it</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-2)]">
          {list.length > 0
            ? `${list.length} rule${list.length === 1 ? '' : 's'} fired on this snapshot. Receipts writes the task text; whether to run it is the operator's call.`
            : 'Receipts writes a task back for work an agent was paid for and a human then overwrote.'}
        </p>
      </div>

      {list.length > 0 ? (
        <ol className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          {list.map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </ol>
      ) : (
        <p className="border-t border-[var(--color-line)] p-6 text-sm leading-relaxed text-[var(--color-text-2)] md:px-8">
          {deadLines === 0
            ? 'No rule fired on this snapshot: nothing this agent wrote reached a commit and was then replaced. The first time that happens, the text to hand back appears here.'
            : `No rule fired on this snapshot, although ${deadLines} authored line${deadLines === 1 ? '' : 's'} no longer survive${deadLines === 1 ? 's' : ''} at HEAD. The rules read the merged corpus; this one has nothing they match.`}
        </p>
      )}

      {/* Said out loud rather than left to be asked. The rule engine emits text. No
          part of this page sends it, runs it, or knows whether anyone did. */}
      <p className="border-t border-[var(--color-line)] p-6 text-xs leading-relaxed text-[var(--color-muted)] md:px-8">
        Nothing here has been pasted back into Bob, and this page has no way to know
        if it ever is. Receipts emits the task text and stops there.
      </p>
    </motion.section>
  );
}
