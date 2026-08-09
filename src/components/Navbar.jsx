function Navbar() {
  return (
    <header className="flex flex-col gap-4 rounded-4xl border border-white/10 bg-slate-950/80 px-5 py-4 shadow-[0_18px_70px_rgba(3,8,20,0.35)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
          Solar analytics dashboard
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          U.S. solar insights for rooftop planning.
        </h2>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">
          React + Vite
        </span>
        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-100">
          Google Maps
        </span>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">
          Solar API
        </span>
      </div>
    </header>
  )
}

export default Navbar
