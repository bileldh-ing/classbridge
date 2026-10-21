import { Skeleton } from "@/components/ui";
export default function Loading() {
  return <div aria-busy="true" aria-live="polite" className="space-y-3"><span className="sr-only">Loading…</span><Skeleton className="h-8 w-64" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}
