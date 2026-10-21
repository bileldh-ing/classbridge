"use client";
import { LogOut } from "lucide-react";
export function SignOutButton({ label }: { label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas" onClick={async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears all client state after sign-out
      window.location.assign("/");
    }}><LogOut aria-hidden className="size-4 rtl-flip" />{label}</button>
  );
}
