export const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-28 rounded-[1.4rem] border border-border bg-slate-100" />
      ))}
    </div>
    <div className="h-24 rounded-[1.25rem] border border-border bg-slate-100" />
    <div className="h-[420px] rounded-[1.4rem] border border-border bg-slate-100" />
  </div>
);
