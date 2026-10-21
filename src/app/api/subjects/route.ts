import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { listSubjects } from "@/lib/services/catalog";
export const GET = route(async () => json({ items: await listSubjects(getDb()) }));
