import { motion } from 'motion/react';
import { useState } from 'react';
import type { Analysis, Remediation } from '../types';
import { coins, shortId } from '../fmt';
import { Chip, CopyButton, Eyebrow, Panel, Section } from './ui';

/* THE ACTION.
   remediations[] carries the literal text an operator pastes back into Bob. It
   has to be readable and it has to be copyable.

   WHAT THIS PANEL MUST NEVER CLAIM: that anything here was run, sent, pasted or
   acted on. Nothing has been. Receipts prints the text and a human decides.
   There is no loop, no round trip, and no callback — and the closing line of
   this section says so in those words, because a judge who assumes otherwise
   has been misled by omission.

   remediations may be absent or empty. That is a legal state: it means the
   snapshot found nothing to escalate, and the panel says that instead of
   vanishing. */

const EASE = [0.32, 0.72, 0, 1] as const;

function Card({ r }: { r: Remediation }) {
  const [showWhy, setShowWhy] = useState(true);

  return (
    <Panel>
      <div className="p-5 sm:p-8 md:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="var(--color-dead)">rule {r.rule}</Chip>
          <Chip>{r.workspace}</Chip>
          <span className="num text-[11px] text-muted">{shortId(r.taskId)}</span>
        </div>

        <h3 className="mt-5 max-w-2xl text-xl leading-tight sm:text-2xl">{r.title}</h3>

        <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* The prompt. Selectable, scrollable inside its own well, never the
              cause of a horizontally scrolling document. */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10px] tracking-[0.18em] text-muted uppercase">
                paste this into Bob
              </span>
              <CopyButton text={r.prompt} />
            </div>
            <div className="mt-3 rounded-xl border hair bg-raised p-4 sm:p-5">
              <p className="num text-[13px] leading-[1.75] whitespace-pre-wrap text-fg-2 select-text">
                {r.prompt}
              </p>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">
              Written by <span className="num">tools/lib.mjs</span> from the evidence on the
              right. Receipts does not send it.
            </p>
          </div>

          {/* The evidence behind the prompt, collapsible so the prompt is what
              the reader meets first. */}
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowWhy(!showWhy)}
              aria-expanded={showWhy}
              className="group flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-[10px] tracking-[0.18em] text-muted uppercase">why</span>
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border hair bg-white/4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ transform: showWhy ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <svg viewBox="0 0 16 16" className="size-3 text-fg-2" fill="none">
                  <path d="m4 6.2 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>

            <motion.div
              animate={{ height: showWhy ? 'auto' : 0, opacity: showWhy ? 1 : 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <dl className="space-y-3 border-b hair pb-5 text-[13px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">File</dt>
                    <dd className="num min-w-0 truncate text-fg">{r.file}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Billed</dt>
                    <dd className="num" style={{ color: 'var(--color-spend)' }}>{coins(r.coins)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Lines authored</dt>
                    <dd className="num text-fg">{r.authored}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Still at HEAD</dt>
                    <dd className="num" style={{ color: r.survived ? 'var(--color-live)' : 'var(--color-dead)' }}>
                      {r.survived}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 text-[13px] leading-relaxed text-fg-2">{r.detail}</p>
                <p className="mt-4 text-[13px] leading-relaxed text-muted">{r.action}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function Action({ analysis }: { analysis: Analysis }) {
  const rs = Array.isArray(analysis.remediations) ? analysis.remediations : [];

  return (
    <Section
      id="action"
      eyebrow="The open item"
      tone="var(--color-spend)"
      title={rs.length ? <>One thing worth asking Bob about.</> : <>Nothing to escalate in this snapshot.</>}
      lede={
        rs.length ? (
          <>
            Receipts ends in text, not in a dashboard. Where a session was paid for code that
            no longer exists, it writes the prompt an operator can paste back into Bob —
            worded to let Bob disagree, because the human overwrite may well have been right.
          </>
        ) : (
          <>
            Every session in this snapshot either still has code at HEAD or has a stated
            reason why it cannot be joined to a commit. There is nothing to paste back.
          </>
        )
      }
      wide
    >
      {rs.length > 0 && (
        <div className="space-y-5">
          {rs.map((r) => <Card key={r.id} r={r} />)}
        </div>
      )}

      {/* THE HONEST LINE. Non-negotiable and deliberately unhedged. */}
      <Panel size="sm" className="mt-5">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-7">
          <Eyebrow tone="var(--color-dead)">No loop was closed</Eyebrow>
          <p className="max-w-3xl text-[14px] leading-relaxed text-fg-2">
            Nothing on this page has ever been pasted back into Bob. Receipts reads exports
            and writes text; it has no connection to Bob, cannot start a task, and cannot
            tell whether anyone ever acted on the prompt above. There is no round trip here
            — only a receipt, and a human holding it.
          </p>
        </div>
      </Panel>
    </Section>
  );
}
