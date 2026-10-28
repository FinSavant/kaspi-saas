'use client';

/** Печать или сохранение в PDF через окно печати браузера. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/25 print:hidden"
    >
      🖨 Печать / PDF
    </button>
  );
}
