"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, inputClass } from "@/components/ui";

/** Private lesson notes (autosave on button) + bookmark toggle. */
export function StudyTools({ lessonId, initialNote, initialBookmarked }: { lessonId: string; initialNote: string; initialBookmarked: boolean }) {
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState<string | null>(null);
  const [bm, setBm] = useState(initialBookmarked);
  return (
    <div className="space-y-2" data-testid="study-tools">
      <Button variant={bm ? "primary" : "secondary"} aria-pressed={bm} onClick={async () => { const r = await api<{ bookmarked: boolean }>(`/api/course-lessons/${lessonId}/bookmark`, { body: { on: !bm } }); setBm(r.bookmarked); }}>
        {bm ? "★ Bookmarked" : "☆ Bookmark"}
      </Button>
      <label htmlFor="lesson-note" className="block text-sm font-medium">My notes (private)</label>
      <textarea id="lesson-note" rows={5} className={inputClass} value={note} onChange={(e) => { setNote(e.target.value); setSaved(null); }} maxLength={10000} />
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={!note.trim()} onClick={async () => {
          try { await api(`/api/course-lessons/${lessonId}/note`, { body: { body: note } }); setSaved("Saved"); } catch (e) { setSaved(e instanceof ApiError ? e.message : "Error"); }
        }}>Save note</Button>
        {saved && <span role="status" className="text-sm text-muted">{saved}</span>}
      </div>
    </div>
  );
}
