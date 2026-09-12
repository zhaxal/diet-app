import { prettyDate } from "@/lib/time-client";

export function SkeletonBar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`loading-skeleton ${className}`} />;
}

export function FoodDaySkeleton({ date }: { date: string }) {
  const label = `Loading food log for ${prettyDate(date).toLowerCase()}`;

  return (
    <div
      className="mt-2 space-y-2"
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid="food-day-skeleton"
    >
      <span className="sr-only">{label}</span>

      <section className="panel overflow-hidden" aria-hidden="true">
        <div
          className="flex min-h-[56px] items-center justify-between gap-3 px-3"
          style={{ borderBottom: "1px solid var(--line)", background: "var(--panel-2)" }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-dim">
              Loading food log
            </p>
            <p className="mt-0.5 text-2xs text-ink-faint">{prettyDate(date)}</p>
          </div>
          <SkeletonBar className="h-5 w-5 shrink-0" />
        </div>
        <div className="space-y-2 px-3 py-3">
          <SkeletonBar className="h-3 w-2/5" />
          <SkeletonBar className="h-8 w-full" />
        </div>
      </section>

      <section className="panel gridlines p-3" aria-hidden="true">
        <SkeletonBar className="h-3 w-20" />
        <div className="mt-2 flex items-end justify-between gap-3">
          <SkeletonBar className="h-9 w-28" />
          <SkeletonBar className="h-4 w-20" />
        </div>
        <SkeletonBar className="mt-3 h-2 w-full" />
      </section>

      <section className="panel grid grid-cols-3 gap-x-3 gap-y-4 p-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <SkeletonBar className="h-2 w-3/5" />
            <SkeletonBar className="h-4 w-4/5" />
          </div>
        ))}
      </section>

      <section className="panel overflow-hidden" aria-hidden="true">
        <div
          className="flex items-center justify-between gap-3 border-b px-3 py-2"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-3 w-12" />
        </div>
        <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {["w-3/5", "w-2/5"].map((width) => (
            <div key={width} className="flex items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBar className={`h-3 ${width}`} />
                <SkeletonBar className="h-2 w-2/5" />
              </div>
              <SkeletonBar className="h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function WorkoutDaySkeleton({ date }: { date: string }) {
  const label = `Loading workout for ${prettyDate(date).toLowerCase()}`;

  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid="workout-day-skeleton"
    >
      <span className="sr-only">{label}</span>

      <section className="panel overflow-hidden" aria-hidden="true">
        <div
          className="flex min-h-[50px] items-center justify-between gap-3 border-b px-3 py-2"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-dim">
              Loading workout
            </p>
            <p className="mt-0.5 text-2xs text-ink-faint">{prettyDate(date)}</p>
          </div>
          <SkeletonBar className="h-3 w-14 shrink-0" />
        </div>

        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-3" aria-hidden="true">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-3 w-16" />
          </div>
          <div
            className="min-h-52 space-y-3 rounded p-3"
            style={{ background: "var(--panel-2)", border: "1px solid var(--line-soft)" }}
          >
            <SkeletonBar className="h-3 w-2/5" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-4/5" />
            <SkeletonBar className="h-3 w-3/5" />
            <SkeletonBar className="h-3 w-5/6" />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <SkeletonBar className="h-8 w-28" />
            <SkeletonBar className="h-3 w-16" />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The app's first paint, before the initial account fetch resolves. Matches
 * the week strip's exact box model (flex-1 cells, border-r, pt-1.5) so nothing
 * shifts when the real strip mounts in its place, and reuses FoodDaySkeleton
 * for the body since Food is the tab a fresh load always lands on. This
 * replaces a bare "Loading" string on an otherwise empty page — the shell was
 * there, then a completely different, richer page reads as broken, not
 * merely a swap.
 */
export function DashboardSkeleton({ date }: { date: string }) {
  return (
    <div role="status" aria-label="Loading your account" aria-busy="true">
      <span className="sr-only">Loading your account</span>

      <nav className="panel flex overflow-x-auto" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="flex-1 border-r pt-1.5 text-center last:border-r-0"
            style={{ borderColor: "var(--line)" }}
          >
            <SkeletonBar className="mx-auto h-2 w-4" />
            <SkeletonBar className="mx-auto mt-1 h-4 w-5" />
            <div className="mb-1.5" />
          </div>
        ))}
      </nav>

      <FoodDaySkeleton date={date} />
    </div>
  );
}
