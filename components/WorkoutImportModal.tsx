"use client";

import { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Dialog } from "@/components/Dialog";

interface WorkoutImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
  weightUnit: string;
}

interface DryRunWorkout {
  date: string;
  title: string;
  exercisesCount: number;
  setsCount: number;
  exerciseNames: string[];
}

export default function WorkoutImportModal({
  open,
  onClose,
  onSuccess,
  weightUnit,
}: WorkoutImportModalProps) {
  const [markdownText, setMarkdownText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [preview, setPreview] = useState<{
    totalWorkouts: number;
    totalExercises: number;
    totalSets: number;
    workouts: DryRunWorkout[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function requestClose() {
    if (markdownText.trim()) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  // Handle file reading
  const handleFile = (file: File) => {
    setError(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setMarkdownText(content);
        // Automatically run dry-run preview on file select
        runDryRun(content);
      }
    };
    reader.onerror = () => setError("Could not read selected file");
    reader.readAsText(file);
  };

  // Run dry-run parse
  const runDryRun = async (text: string) => {
    if (!text.trim()) {
      setError("Please paste markdown or upload a file first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.importWorkouts({
        markdown: text,
        dryRun: true,
      });

      if (res.dryRun && res.workouts) {
        setPreview({
          totalWorkouts: res.totalWorkouts || 0,
          totalExercises: res.totalExercises || 0,
          totalSets: res.totalSets || 0,
          workouts: res.workouts,
        });
      } else {
        setError("No workouts detected in this markdown");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse markdown");
    } finally {
      setLoading(false);
    }
  };

  // Execute full import
  const handleCommitImport = async () => {
    if (!markdownText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.importWorkouts({
        markdown: markdownText,
        dryRun: false,
        overwrite: true,
      });

      if (res.ok) {
        onSuccess(res.total || 0);
      } else {
        setError("Import failed to save workouts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title="Import Workouts"
      description="Obsidian Markdown · Bulk Notes"
      size="lg"
      bodyClassName="p-4"
      footer={
        confirmDiscard ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-over">Discard the import text and preview?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="btn btn-ghost"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn border border-over text-over hover:bg-over hover:text-panel"
              >
                Discard import
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="btn btn-ghost px-3 py-1.5 text-xs text-ink-dim"
            >
              Cancel
            </button>

            {!preview ? (
              <button
                type="button"
                disabled={loading || !markdownText.trim()}
                onClick={() => runDryRun(markdownText)}
                className="btn btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                <span>Preview Import</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleCommitImport}
                className="btn btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                <span>Confirm & Import ({preview.totalWorkouts})</span>
              </button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-3.5 text-xs">
          <p className="text-ink-dim leading-relaxed">
            Paste your Obsidian workout notes below or upload a <code className="font-mono text-2xs px-1 py-0.5 rounded border" style={{ borderColor: "var(--line)" }}>.md</code> file. Multi-day journals with dated headers (e.g. <span className="font-mono text-ink font-semibold">## 2026-09-08 Push Day</span>) are automatically split and mapped to dates.
          </p>

          {/* Upload Button */}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[36px] flex items-center gap-1.5 rounded px-3 py-1.5 border font-medium text-ink hover:border-accent transition-colors"
              style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
            >
              <UploadCloud size={14} aria-hidden="true" />
              <span>Choose .md file</span>
            </button>
          </div>

          {/* Markdown Textarea */}
          <div className="space-y-1">
            <label className="text-2xs uppercase tracking-wider text-ink-faint font-semibold">
              Markdown Content
            </label>
            <textarea
              aria-label="Obsidian markdown import text"
              value={markdownText}
              onChange={(e) => {
                setMarkdownText(e.target.value);
                setPreview(null);
                setConfirmDiscard(false);
              }}
              placeholder={`## 2026-09-08 Push Day\nBench Press\n- 80${weightUnit} x 8\n- 80${weightUnit} x 8\n\n## 2026-09-10 Pull Day\nPullups\n- BW x 10`}
              rows={8}
              className="w-full rounded p-3 font-mono text-base sm:text-xs leading-relaxed text-ink focus:outline-none"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--line-soft)",
              }}
            />
          </div>

          {/* Error notice */}
          {error && (
            <div
              className="p-3 rounded border flex items-center gap-2 text-over"
              style={{
                borderColor: "var(--over)",
                background: "color-mix(in srgb, var(--over) 8%, transparent)",
              }}
            >
              <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Parse Preview Summary */}
          {preview && (
            <div
              className="p-3 rounded border space-y-2"
              style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
            >
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <CheckCircle2 size={15} className="text-ok" aria-hidden="true" />
                <span>Parse Preview</span>
              </div>
              <div className="flex gap-4 text-ink-dim text-2xs">
                <span><strong className="num text-ink">{preview.totalWorkouts}</strong> workouts</span>
                <span><strong className="num text-ink">{preview.totalExercises}</strong> exercises</span>
                <span><strong className="num text-ink">{preview.totalSets}</strong> sets</span>
              </div>

              <div className="max-h-36 overflow-y-auto divide-y border rounded text-2xs" style={{ borderColor: "var(--line-soft)" }}>
                {preview.workouts.map((w, idx) => (
                  <div key={idx} className="p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="num font-semibold text-ink">{w.date}</span>
                      <span className="text-ink-dim truncate">{w.title}</span>
                    </div>
                    <span className="num text-ink-faint shrink-0">
                      {w.exercisesCount} ex · {w.setsCount} sets
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </Dialog>
  );
}
