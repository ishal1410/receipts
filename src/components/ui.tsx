import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

/* Shared primitives. Everything visual on this page is built out of these five
   so that the nested-bezel language is stated once instead of re-typed per
   panel. Icons are hand-drawn at stroke-width 1.25 — no icon font, no thick
   library stroke. */

const EASE = [0.32, 0.72, 0, 1] as const;

/** Outer machined tray + inner glass plate, with concentric radii. Never place
 *  content directly on the page ground. */
export function Panel({
  children, className = '', size = 'lg',
}: { children: ReactNode; className?: string; size?: 'lg' | 'sm' }) {
  const s = size === 'sm' ? 'shell shell-sm' : 'shell';
  const c = size === 'sm' ? 'core core-sm' : 'core';
  return (
    <div className={`${s} ${className}`}>
      <div className={`${c} h-full`}>{children}</div>
    </div>
  );
}

export function Eyebrow({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className="eyebrow">
      <span
        aria-hidden
        className="block size-[5px] rounded-full"
        style={{ background: tone ?? 'var(--color-fg-2)', boxShadow: `0 0 8px ${tone ?? 'transparent'}` }}
      />
      {children}
    </span>
  );
}

/** A section of the document. Macro-whitespace is set here, once. */
export function Section({
  id, eyebrow, tone, title, lede, children, wide = false,
}: {
  id: string; eyebrow: string; tone?: string; title: ReactNode;
  lede?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  return (
    <section id={id} className="relative scroll-mt-28 px-4 py-20 sm:px-6 md:py-28 lg:py-32">
      <div className={`mx-auto ${wide ? 'max-w-[84rem]' : 'max-w-6xl'}`}>
        <header className="max-w-3xl">
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
          <h2 className="mt-5">{title}</h2>
          {lede && <p className="mt-5 text-base leading-relaxed text-fg-2 sm:text-lg">{lede}</p>}
        </header>
        <div className="mt-10 md:mt-14">{children}</div>
      </div>
    </section>
  );
}

/** Figure over label. The figure is always mono; the label never competes. */
export function Stat({
  value, label, sub, tone, size = 'md',
}: { value: ReactNode; label: string; sub?: ReactNode; tone?: string; size?: 'md' | 'lg' | 'xl' }) {
  const cls = size === 'xl'
    ? 'text-4xl sm:text-5xl md:text-6xl'
    : size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl';
  return (
    <div className="min-w-0">
      <div className={`num ${cls} font-medium leading-none`} style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="mt-2.5 text-[11px] uppercase tracking-[0.16em] text-muted">{label}</div>
      {sub && <div className="mt-1.5 text-[13px] leading-snug text-fg-2">{sub}</div>}
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className="num inline-flex shrink-0 items-center rounded-full border px-2.5 py-[3px] text-[11px] whitespace-nowrap"
      style={{
        borderColor: tone ? `${tone}38` : 'rgb(255 255 255 / 0.1)',
        color: tone ?? 'var(--color-fg-2)',
        background: tone ? `${tone}12` : 'rgb(255 255 255 / 0.03)',
      }}
    >
      {children}
    </span>
  );
}

export function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-3.5 ${className}`} fill="none" aria-hidden>
      <path d="M3.2 12.8 12.8 3.2M6 3.2h6.8V10" stroke="currentColor" strokeWidth="1.25"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Nested CTA: the trailing glyph lives in its own circle flush with the
 *  button's inner padding, and gains kinetic tension on hover. */
export function Cta({
  href, children, tone = 'var(--color-fg)', filled = false,
}: { href: string; children: ReactNode; tone?: string; filled?: boolean }) {
  return (
    <motion.a
      href={href}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.975 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="group inline-flex items-center gap-3 rounded-full border py-2 pr-2 pl-6 text-sm font-medium"
      style={
        filled
          ? { background: tone, color: '#08080A', borderColor: tone }
          : { borderColor: 'rgb(255 255 255 / 0.14)', background: 'rgb(255 255 255 / 0.035)', color: 'var(--color-fg)' }
      }
    >
      {children}
      <span
        className="grid size-8 place-items-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-[3px] group-hover:-translate-y-px group-hover:scale-105"
        style={{ background: filled ? 'rgb(0 0 0 / 0.14)' : 'rgb(255 255 255 / 0.08)' }}
      >
        <Arrow className={filled ? '' : 'text-fg'} />
      </span>
    </motion.a>
  );
}

/** Copy-to-clipboard that tells the truth when it fails. No silent catch: on a
 *  non-secure origin writeText rejects, and the reader is told to select the
 *  text rather than left believing something was copied. */
export function CopyButton({ text, label = 'Copy prompt' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2600);
    return () => clearTimeout(t);
  }, [state]);

  const copy = () => {
    // navigator.clipboard is undefined on a non-secure origin, so this is a
    // presence check before a call and not a `?.` on the promise.
    const p = navigator.clipboard?.writeText(text);
    if (!p) { setState('fail'); return; }
    p.then(() => setState('ok'), () => setState('fail'));
  };

  const msg = state === 'ok' ? 'Copied' : state === 'fail' ? 'Select it manually' : label;
  const tone = state === 'ok' ? 'var(--color-live)' : state === 'fail' ? 'var(--color-dead)' : 'var(--color-spend)';

  return (
    <motion.button
      type="button"
      onClick={copy}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="group inline-flex items-center gap-2.5 rounded-full border py-1.5 pr-1.5 pl-4 text-[13px] font-medium"
      style={{ borderColor: `${tone}40`, background: `${tone}14`, color: tone }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={msg}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {msg}
        </motion.span>
      </AnimatePresence>
      <span
        className="grid size-7 place-items-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"
        style={{ background: `${tone}20` }}
      >
        {state === 'ok' ? (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
            <path d="m3.5 8.4 3 3 6-6.8" stroke="currentColor" strokeWidth="1.4"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
            <rect x="5.4" y="5.4" width="7.2" height="7.2" rx="1.6" stroke="currentColor" strokeWidth="1.25" />
            <path d="M10.6 3.4H4.9a1.5 1.5 0 0 0-1.5 1.5v5.7" stroke="currentColor" strokeWidth="1.25"
                  strokeLinecap="round" />
          </svg>
        )}
      </span>
    </motion.button>
  );
}

/** Click the evidence, see the evidence. Bob's panel is 1285px wide and the
 *  coin badge is the whole point of showing it, so it gets a full-screen
 *  glass overlay rather than a new tab. */
export function Lightbox({
  src, alt, width, height, caption,
}: { src: string; alt: string; width: number; height: number; caption?: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border hair bg-void text-left"
        aria-label={`Enlarge: ${alt}`}
      >
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async"
             className="block h-auto w-full opacity-[0.94] transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:opacity-100" />
        <span className="num pointer-events-none absolute right-2.5 bottom-2.5 rounded-full border border-white/12 bg-void/80 px-2.5 py-1 text-[10px] tracking-wide text-fg-2 opacity-0 backdrop-blur-md transition-opacity duration-500 group-hover:opacity-100">
          enlarge
        </span>
      </motion.button>
      {caption && <div className="mt-3 text-[13px] leading-relaxed text-muted">{caption}</div>}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-3 backdrop-blur-2xl sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            <motion.img
              src={src} alt={alt}
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="max-h-full w-auto max-w-full rounded-xl border hair shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-white/12 bg-white/6 text-fg backdrop-blur-md sm:top-7 sm:right-7"
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
                <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
