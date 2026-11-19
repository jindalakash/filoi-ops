"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, FileText, X } from "lucide-react";

const MAX = 50 * 1024 * 1024;
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);

/**
 * Pick several files for a form: paste screenshots (⌘V / Ctrl+V anywhere in the form),
 * drag & drop, or browse. Files go into a real <input type=file name={name}> so the server action receives them.
 */
export function AttachmentPicker({ name = "files", label = "Screenshots & files", hint }: { name?: string; label?: string; hint?: string }) {
  // each chosen file with a preview URL for images
  const [files, setFiles] = useState<{ file: File; url: string | null }[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef<string[]>([]);

  // keep the hidden file input in sync with the chosen files
  useEffect(() => {
    if (!input.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f.file));
    input.current.files = dt.files;
    live.current = files.flatMap((f) => (f.url ? [f.url] : []));
  }, [files]);
  useEffect(() => () => live.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX);
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} is larger than 50 MB.` : null);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const ok = incoming.filter((f) => f.size <= MAX).map((f, i) =>
      // pasted screenshots arrive as "image.png" — give them a useful, unique name
      /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? new File([f], `screenshot-${stamp}${i ? `-${i + 1}` : ""}.${f.name.split(".").pop()}`, { type: f.type }) : f);
    if (ok.length) setFiles((x) => [...x, ...ok.map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }))]);
  };

  // paste anywhere inside the surrounding form; clear after the form resets (successful save)
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const paste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (pasted.length) { e.preventDefault(); add(pasted); }
    };
    const reset = () => { live.current.forEach((u) => URL.revokeObjectURL(u)); setFiles([]); setError(null); };
    form.addEventListener("paste", paste);
    form.addEventListener("reset", reset);
    return () => { form.removeEventListener("paste", paste); form.removeEventListener("reset", reset); };
  }, []);


  return (
    <div>
      <span className="label">{label}</span>
      <input ref={input} type="file" name={name} multiple className="hidden" onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
      <div tabIndex={0} role="button" aria-label="Add files: paste a screenshot, drop files or click to browse"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
        className={clsx("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition outline-none focus-visible:border-sky",
          over ? "border-sky bg-sky/5" : "border-line hover:border-sky/50 hover:bg-mist/50")}>
        <ImagePlus size={20} className="text-ink-soft" />
        <span><b>Paste a screenshot</b> (⌘V / Ctrl+V), drop files here, or <span className="text-sky underline">browse</span></span>
        <span className="text-xs text-ink-soft">{hint ?? "Images, PDFs, Word or Excel — up to 50 MB each."}</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {files.map(({ file: f, url: u }, i) => {
            return (
              <li key={`${f.name}-${i}`} className="group relative overflow-hidden rounded-lg border border-line bg-surface">
                {u
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a served image
                  ? <img src={u} alt={f.name} className="h-24 w-full object-cover" />
                  : <div className="grid h-24 place-items-center bg-mist"><FileText size={26} className="text-ink-soft" /></div>}
                <div className="truncate px-2 py-1 text-[11px] text-ink-soft" title={f.name}>{f.name} · {size(f.size)}</div>
                <button type="button" onClick={() => { if (u) URL.revokeObjectURL(u); setFiles((x) => x.filter((_, j) => j !== i)); }} aria-label={`Remove ${f.name}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-night/70 text-white opacity-90 hover:bg-red-600"><X size={13} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
