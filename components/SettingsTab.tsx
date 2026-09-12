"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
import type { Goals } from "@/lib/api-client";
import ThemeToggle from "@/components/ThemeToggle";
import GoalsCard from "@/components/GoalsCard";
import ProductsCard from "@/components/ProductsCard";
import { Header, Panel } from "@/components/Panel";
import { AlertDialog } from "@/components/Dialog";
import InstallPwaCard from "@/components/InstallPwaCard";
import { useAnimatedDisclosure } from "@/lib/useAnimatedDisclosure";

interface Props {
  email: string;
  goals: Goals;
  setGoals: (g: Goals) => void;
  latestWeight: number | null;
  mcpUrl: string;
  displayedMcpUrl: string;
  urlRevealed: boolean;
  setUrlRevealed: React.Dispatch<React.SetStateAction<boolean>>;
  copyUrl: () => void;
  urlCopied: boolean;
  regenerateKey: () => Promise<void>;
  confirmingRegenerate: boolean;
  setConfirmingRegenerate: (c: boolean) => void;
  exporting: string | null;
  downloadExport: (fmt: "json" | "csv") => Promise<void>;
  date: string;
  onOpenWorkoutImport: () => void;
  onOpenShortcuts: () => void;
  logout: () => Promise<void>;
}

export default function SettingsTab({
  email,
  goals,
  setGoals,
  latestWeight,
  mcpUrl,
  displayedMcpUrl,
  urlRevealed,
  setUrlRevealed,
  copyUrl,
  urlCopied,
  regenerateKey,
  confirmingRegenerate,
  setConfirmingRegenerate,
  exporting,
  downloadExport,
  date,
  onOpenWorkoutImport,
  onOpenShortcuts,
  logout,
}: Props) {
  const [showMcpDetails, setShowMcpDetails] = useState(false);
  const [showImportExportDetails, setShowImportExportDetails] = useState(false);
  const mcpDetails = useAnimatedDisclosure(showMcpDetails);
  const importExportDetails = useAnimatedDisclosure(showImportExportDetails);

  return (
    <>
      <Header sub={email}>Settings</Header>

      <div className="panel mb-2 flex items-center justify-between px-3 py-2">
        <span className="text-2xs uppercase tracking-wider text-ink-dim">Appearance</span>
        <ThemeToggle />
      </div>

      <InstallPwaCard />

      <GoalsCard
        goals={goals}
        latestWeight={latestWeight}
        onGoalsChange={setGoals}
      />

      {/* AI Assistant / MCP connector */}
      <section className="panel mt-2 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            AI Assistant / MCP connector
          </h2>
          <button
            type="button"
            onClick={() => setShowMcpDetails((s) => !s)}
            className="text-2xs text-ink-faint hover:text-ink transition-colors flex items-center gap-1"
            aria-expanded={showMcpDetails}
          >
            <span>{showMcpDetails ? "Hide details" : "Details"}</span>
            <span className="num text-xs">{showMcpDetails ? "−" : "+"}</span>
          </button>
        </div>

        {mcpDetails.rendered && (
          <div
            onAnimationEnd={mcpDetails.onAnimationEnd}
            className={`motion-disclosure-content ${mcpDetails.closing ? "motion-disclosure-content--closing" : ""} mt-2 space-y-1.5 border-b pb-2.5 text-2xs text-ink-faint`}
            style={{ borderColor: "var(--line-soft)" }}
          >
            <p>
              Connect any MCP client (Claude, Cursor, Windsurf, ChatGPT) to auto-log meals from labels, photos, or barcodes.
            </p>
            <p className="text-over">
              Anyone with this URL can read and change your diet data.
            </p>
            <div>
              Includes <strong className="text-ink-dim">13 tools</strong> (barcode lookup, nutrition OCR, auto-saving) &amp; <strong className="text-ink-dim">5 live resources</strong> (@today/summary, @today/entries, @catalog/products).
            </div>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1.5">
          <code
            className="num min-w-0 flex-1 truncate rounded px-2 py-1.5 text-2xs text-ink-dim"
            style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
          >
            {displayedMcpUrl}
          </code>
          <button
            onClick={() => setUrlRevealed((shown) => !shown)}
            disabled={!mcpUrl}
            className="btn btn-ghost shrink-0"
          >
            {urlRevealed ? "Hide" : "Reveal"}
          </button>
          <button onClick={copyUrl} disabled={!mcpUrl} className="btn btn-primary shrink-0">
            {urlCopied ? "✓" : "Copy"}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-2xs">
          <span className="text-ink-faint">
            Timezone <span className="num text-ink-dim">{goals.timezone}</span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmingRegenerate(true)}
            className="text-ink-faint hover:text-over"
          >
            Regenerate key
          </button>
        </div>
      </section>

      <AlertDialog
        open={confirmingRegenerate}
        onClose={() => setConfirmingRegenerate(false)}
        title="Regenerate connector key?"
        description="The current connector URL will stop working immediately. Every connected assistant will need the new URL."
        confirmLabel="Regenerate key"
        onConfirm={regenerateKey}
      />

      <Panel title="Product catalog" hint="labels you can log by amount" defaultOpen={false}>
        <ProductsCard />
      </Panel>

      <section className="panel mt-2 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Import & Export
          </h2>
          <button
            type="button"
            onClick={() => setShowImportExportDetails((s) => !s)}
            className="text-2xs text-ink-faint hover:text-ink transition-colors flex items-center gap-1"
            aria-expanded={showImportExportDetails}
          >
            <span>{showImportExportDetails ? "Hide details" : "Details"}</span>
            <span className="num text-xs">{showImportExportDetails ? "−" : "+"}</span>
          </button>
        </div>

        {importExportDetails.rendered && (
          <div
            onAnimationEnd={importExportDetails.onAnimationEnd}
            className={`motion-disclosure-content ${importExportDetails.closing ? "motion-disclosure-content--closing" : ""} mt-2 space-y-1 border-b pb-2.5 text-2xs text-ink-faint`}
            style={{ borderColor: "var(--line-soft)" }}
          >
            <p>
              <strong className="text-ink-dim">JSON:</strong> Complete backup (food, weight, products, workouts).
            </p>
            <p>
              <strong className="text-ink-dim">CSV:</strong> Tabular food log entries for spreadsheets.
            </p>
            <p>
              <strong className="text-ink-dim">Vault (.md):</strong> Workout logs formatted for Obsidian.
            </p>
            <p>
              <strong className="text-ink-dim">Import:</strong> Markdown logs from Obsidian, Hevy, or Strong. Dry-run preview supported.
            </p>
          </div>
        )}

        {/* Export */}
        <div className="mt-2.5">
          <span className="text-2xs text-ink-faint block uppercase tracking-wider mb-1.5">
            Export Data
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => downloadExport("json")}
              disabled={exporting !== null}
              className="btn btn-ghost text-center text-2xs"
            >
              {exporting === "json" ? "Preparing…" : "JSON Backup"}
            </button>
            <button
              onClick={() => downloadExport("csv")}
              disabled={exporting !== null}
              className="btn btn-ghost text-center text-2xs"
            >
              {exporting === "csv" ? "Preparing…" : "CSV Entries"}
            </button>
            <a
              href="/api/workouts/export?format=markdown"
              download={`workouts-vault-${date}.md`}
              className="btn btn-ghost text-center text-2xs flex items-center justify-center"
            >
              Vault (.md)
            </a>
          </div>
        </div>

        {/* Import */}
        <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
          <span className="text-2xs text-ink-faint block uppercase tracking-wider mb-1.5">
            Import Data
          </span>
          <button
            type="button"
            onClick={onOpenWorkoutImport}
            className="btn btn-ghost w-full text-center text-2xs flex items-center justify-center gap-1.5"
          >
            <UploadCloud size={13} aria-hidden="true" />
            <span>Import Workouts (Markdown)</span>
          </button>
        </div>
      </section>

      {/* Guide & Shortcuts Reference (Progressive Disclosure) */}
      <Panel title="Guide & Shortcuts" hint="reference & keys" defaultOpen={false}>
        <div className="space-y-3 text-xs text-ink-dim">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-2xs text-ink">
                Keyboard Shortcuts
              </span>
              <button
                type="button"
                onClick={onOpenShortcuts}
                className="text-2xs text-accent hover:underline"
              >
                Open Cheat Sheet (?)
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 text-2xs">
              <span className="text-ink-faint"><kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">←</kbd> / <kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">→</kbd> Change Day</span>
              <span className="text-ink-faint"><kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">T</kbd> Jump to Today</span>
              <span className="text-ink-faint"><kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">N</kbd> or <kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">/</kbd> Add Food</span>
              <span className="text-ink-faint"><kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">1</kbd> / <kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">2</kbd> / <kbd className="num border px-1 py-0.5 rounded bg-panel-2 border-line text-ink">3</kbd> Switch Tabs</span>
            </div>
          </div>

          <div className="border-t pt-2.5 space-y-1.5 text-2xs text-ink-faint" style={{ borderColor: "var(--line-soft)" }}>
            <p>
              <strong className="text-ink-dim uppercase tracking-wider">TDEE:</strong> Total Daily Energy Expenditure estimate based on the Mifflin–St Jeor formula and activity multiplier. Use it to set a daily calorie deficit or surplus.
            </p>
            <p>
              <strong className="text-ink-dim uppercase tracking-wider">Portion Modes:</strong> <span className="text-ink">as eaten</span> logs the exact portion totals entered; <span className="text-ink">per 100g / 100ml</span> stores standard package reference values that scale proportionally with your serving weight.
            </p>
            <p>
              <strong className="text-ink-dim uppercase tracking-wider">Copy Tray:</strong> Device-local clipboard that stages entries across days so you can duplicate meals without re-typing figures.
            </p>
          </div>
        </div>
      </Panel>

      <div className="mt-3 flex items-center justify-between">
        <Link href="/api-docs" className="text-2xs text-ink-dim underline hover:text-ink">API docs ↗</Link>
        <button onClick={logout} className="btn btn-ghost">Log out</button>
      </div>
    </>
  );
}
