/** Логотип SANQ: синие полосы слева и «SANQ» с синей Q. */
export function Logo({ size = 'md', dark = false }: { size?: 'md' | 'lg'; dark?: boolean }) {
  const h = size === 'lg' ? 'h-7' : 'h-5';
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>
      <span className={`flex ${h} items-end gap-[3px]`} aria-hidden>
        <span className="h-1/2 w-[5px] rounded-sm bg-blue-600" />
        <span className="h-3/4 w-[5px] rounded-sm bg-blue-600" />
        <span className="h-full w-[5px] rounded-sm bg-blue-600" />
      </span>
      <span className={dark ? 'text-white' : 'text-slate-900'}>
        SAN<span className="text-blue-600">Q</span>
      </span>
    </span>
  );
}
