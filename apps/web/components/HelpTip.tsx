/**
 * Мини-инструкция вкладки: значок «?» рядом с заголовком, при наведении (или нажатии
 * на телефоне) — плашка с короткими шагами.
 */
export function HelpTip({ title, steps }: { title: string; steps: string[] }) {
  return (
    <span className="group relative inline-flex align-middle print:hidden">
      <button
        type="button"
        aria-label={`Как пользоваться: ${title}`}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-500 hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:text-blue-600"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="invisible absolute top-8 left-0 z-40 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-normal text-slate-700 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="mb-2 block font-semibold text-slate-900">{title}</span>
        <ol className="list-decimal space-y-1 pl-4">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </span>
    </span>
  );
}
