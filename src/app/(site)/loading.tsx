import { Skeleton } from "@/components/ui";
export default function Loading() {
  return <div aria-busy="true" className="mx-auto max-w-7xl space-y-3 px-4 py-10"><span className="sr-only">Loading…</span><Skeleton className="h-10 w-80" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
}
