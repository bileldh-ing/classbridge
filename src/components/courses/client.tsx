"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, inputClass, Label } from "@/components/ui";
import { parseMajorToMinor, minorToMajorString } from "@/lib/money";

export function QuizRunner({ quiz }: { quiz: { id: string; maxAttempts: number; passingScorePct: number; attemptsUsed: number; bestScore: number | null; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }> } }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<null | { scorePct: number; passed: boolean; perQuestion: Record<string, boolean>; explanations: Record<string, string>; attemptsUsed: number; maxAttempts: number; certificateCode: string | null }>(null);
  const [err, setErr] = useState<string | null>(null);
  const left = quiz.maxAttempts - (result?.attemptsUsed ?? quiz.attemptsUsed);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Pass mark {quiz.passingScorePct}% · attempts left: {left} of {quiz.maxAttempts}{quiz.bestScore !== null ? ` · best so far ${quiz.bestScore}%` : ""}</p>
      {quiz.questions.length === 0 && <Alert tone="info">This quiz has no questions yet.</Alert>}
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        try { const r = await api<NonNullable<typeof result>>(`/api/quizzes/${quiz.id}/attempts`, { body: { answers } }); setResult(r); router.refresh(); }
        catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Error"); }
      }}>
        {quiz.questions.map((q, i) => (
          <fieldset key={q.id} className={`rounded-lg border p-3 ${result ? (result.perQuestion[q.id] ? "border-emerald-300" : "border-red-300") : "border-line"}`}>
            <legend className="px-1 text-sm font-medium">{i + 1}. {q.prompt}</legend>
            {q.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" disabled={!!result} checked={answers[q.id]?.includes(o.id) ?? false}
                onChange={(ev) => setAnswers((a) => ({ ...a, [q.id]: ev.target.checked ? [...(a[q.id] ?? []), o.id] : (a[q.id] ?? []).filter((x) => x !== o.id) }))} />{o.label}</label>
            ))}
            {result && result.explanations[q.id] && <p className="mt-1 text-xs text-muted">{result.explanations[q.id]}</p>}
          </fieldset>
        ))}
        {err && <Alert tone="error">{err}</Alert>}
        {result ? (
          <div className="space-y-2">
            <Alert tone={result.passed ? "success" : "warn"}>Score {result.scorePct}% — {result.passed ? "passed" : "not passed yet"}.</Alert>
            {result.certificateCode && <Alert tone="success">Course complete! <Link className="underline" href={`/certificates/${result.certificateCode}`}>View your certificate</Link></Alert>}
            {!result.passed && left > 0 && <Button type="button" variant="secondary" onClick={() => { setResult(null); setAnswers({}); }}>Try again</Button>}
          </div>
        ) : <Button type="submit" disabled={left <= 0 || quiz.questions.length === 0}>Submit answers</Button>}
      </form>
    </div>
  );
}

export function CompleteLessonButton({ lessonId, done }: { lessonId: string; done: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ done: boolean; cert: string | null; err: string | null }>({ done, cert: null, err: null });
  if (state.done) return <div className="space-y-2"><Alert tone="success">Lesson completed.</Alert>{state.cert && <Alert tone="success">Course complete! <Link className="underline" href={`/certificates/${state.cert}`}>View your certificate</Link></Alert>}</div>;
  return (
    <div><Button onClick={async () => {
      try { const r = await api<{ certificateCode: string | null }>(`/api/course-lessons/${lessonId}/complete`, { body: {} }); setState({ done: true, cert: r.certificateCode, err: null }); router.refresh(); }
      catch (e) { setState((s) => ({ ...s, err: e instanceof ApiError ? e.message : "Error" })); }
    }}>Mark as complete</Button>{state.err && <p role="alert" className="mt-1 text-sm text-red-700">{state.err}</p>}</div>
  );
}

export function CourseForm({ subjects, initial, id }: { subjects: Array<{ id: string; name: string }>; id?: string; initial?: { title: string; summary: string; objectives: string; prerequisites: string; level: string; language: string; priceMinor: number; currency: string; subjectId: string | null; passingScorePct: number } }) {
  const router = useRouter();
  const [f, setF] = useState({ title: initial?.title ?? "", summary: initial?.summary ?? "", objectives: initial?.objectives ?? "", prerequisites: initial?.prerequisites ?? "", level: initial?.level ?? "beginner", language: initial?.language ?? "en",
    price: initial ? minorToMajorString(initial.priceMinor, initial.currency) : "0", currency: initial?.currency ?? "EUR", subjectId: initial?.subjectId ?? "", passingScorePct: initial?.passingScorePct ?? 70 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try {
        const body = { ...f, price: undefined, priceMinor: parseMajorToMinor(f.price || "0", f.currency), subjectId: f.subjectId || null };
        const r = await api<{ redirect?: string }>(id ? `/api/teacher/courses/${id}` : "/api/teacher/courses", { method: id ? "PUT" : "POST", body });
        if (r.redirect) router.push(r.redirect); else { setMsg({ ok: true, text: "Saved" }); router.refresh(); }
      } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Error" }); }
    }}>
      <div><Label htmlFor="ct">Title</Label><input id="ct" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputClass} /></div>
      <div><Label htmlFor="cs">Summary</Label><textarea id="cs" rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} className={inputClass} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="co">Objectives</Label><textarea id="co" rows={2} value={f.objectives} onChange={(e) => setF({ ...f, objectives: e.target.value })} className={inputClass} /></div>
        <div><Label htmlFor="cp">Prerequisites</Label><textarea id="cp" rows={2} value={f.prerequisites} onChange={(e) => setF({ ...f, prerequisites: e.target.value })} className={inputClass} /></div>
        <div><Label htmlFor="cl">Level</Label><select id="cl" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className={inputClass}><option>beginner</option><option>intermediate</option><option>advanced</option></select></div>
        <div><Label htmlFor="clang">Language</Label><select id="clang" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} className={inputClass}>{["en", "fr", "ar", "de", "es", "it"].map((l) => <option key={l}>{l}</option>)}</select></div>
        <div><Label htmlFor="cpr">Price (0 = free)</Label><input id="cpr" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputClass} /></div>
        <div><Label htmlFor="ccur">Currency</Label><select id="ccur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className={inputClass}>{["EUR", "USD", "GBP", "TND", "CAD", "MAD"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><Label htmlFor="csub">Subject</Label><select id="csub" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })} className={inputClass}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Label htmlFor="cpass">Course pass mark (%)</Label><input id="cpass" type="number" min={1} max={100} value={f.passingScorePct} onChange={(e) => setF({ ...f, passingScorePct: Number(e.target.value) })} className={inputClass} /></div>
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit">{id ? "Save course" : "Create course"}</Button>
    </form>
  );
}

export function SectionForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api(`/api/teacher/courses/${courseId}/sections`, { body: { title } }); setTitle(""); router.refresh(); } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Error"); } }}>
      <label htmlFor="sec" className="sr-only">Section title</label><input id="sec" placeholder="New section title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required minLength={2} />
      <Button type="submit" variant="secondary">Add section</Button>{err && <span role="alert" className="text-sm text-red-700">{err}</span>}
    </form>
  );
}

export function LessonForm({ courseId, sectionId }: { courseId: string; sectionId: string }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", type: "text", content: "", externalUrl: "", isPreview: false, durationMinutes: 10 });
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-2 grid gap-2 rounded-lg bg-canvas p-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      try { await api(`/api/teacher/courses/${courseId}/lessons`, { body: { ...f, sectionId } }); setF({ ...f, title: "", content: "", externalUrl: "" }); router.refresh(); }
      catch (e2) { setErr(e2 instanceof ApiError ? `${e2.message} ${e2.details ? JSON.stringify(e2.details) : ""}` : "Error"); }
    }}>
      <input aria-label="Lesson title" placeholder="Lesson title" required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputClass} />
      <select aria-label="Lesson type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputClass}><option value="text">Text</option><option value="video">Video (https link)</option><option value="resource">Resource (https link)</option><option value="link">Interactive link</option><option value="quiz">Quiz</option></select>
      {f.type !== "quiz" && <textarea aria-label="Content" placeholder="Lesson content (plain text)" rows={3} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} className={`${inputClass} sm:col-span-2`} />}
      {["video", "resource", "link"].includes(f.type) && <input aria-label="URL" type="url" placeholder="https://" value={f.externalUrl} onChange={(e) => setF({ ...f, externalUrl: e.target.value })} className={inputClass} />}
      <input aria-label="Duration (minutes)" type="number" min={1} max={600} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} className={inputClass} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isPreview} onChange={(e) => setF({ ...f, isPreview: e.target.checked })} />Free preview</label>
      {err && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{err}</p>}
      <Button type="submit" variant="secondary" className="sm:col-span-2">Add lesson</Button>
    </form>
  );
}

export function QuestionForm({ courseId, quizId }: { courseId: string; quizId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState([{ label: "", isCorrect: true }, { label: "", isCorrect: false }]);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-2 space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      try { await api(`/api/teacher/courses/${courseId}/questions`, { body: { quizId, prompt, explanation: explanation || undefined, options } }); setPrompt(""); setExplanation(""); setOptions([{ label: "", isCorrect: true }, { label: "", isCorrect: false }]); router.refresh(); }
      catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Error"); }
    }}>
      <input aria-label="Question" placeholder="Question" required minLength={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={inputClass} />
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`Option ${i + 1} correct`} type="checkbox" checked={o.isCorrect} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, isCorrect: e.target.checked } : x)))} />
          <input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} required value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
        </div>
      ))}
      {options.length < 6 && <button type="button" className="text-sm text-brand-700 underline" onClick={() => setOptions([...options, { label: "", isCorrect: false }])}>+ option</button>}
      <input aria-label="Explanation" placeholder="Explanation shown after submission (optional)" value={explanation} onChange={(e) => setExplanation(e.target.value)} className={inputClass} />
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <Button type="submit" variant="secondary">Add question</Button>
    </form>
  );
}
