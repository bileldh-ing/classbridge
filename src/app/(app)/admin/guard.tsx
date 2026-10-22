import { forbidden } from "next/navigation";
import { can, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/core";
/** Renders the 403 page (real HTTP 403) when the viewer lacks a finer-grained staff permission. */
export function Denied(): never { forbidden(); }
export const allowed = (u: SessionUser, p: Permission) => can(u, p);
