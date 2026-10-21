import { can, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/core";
import { Alert } from "@/components/ui";
export function Denied() { return <Alert tone="error" title="Permission denied">Your role does not include this permission.</Alert>; }
export const allowed = (u: SessionUser, p: Permission) => can(u, p);
