"use client";

import {
  AlertCircle,
  ArrowUpRight,
  Database,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  IntelligenceOverlap,
  IntelligencePerson,
  IntelligenceResult,
} from "@/lib/people-intelligence";
import {
  DEFAULT_INTELLIGENCE_SEED,
  DEFAULT_PUBLIC_ROSTER,
} from "@/lib/people-intelligence";

export default function PeopleIntelligenceWorkbench() {
  const [seedQuery, setSeedQuery] = useState(DEFAULT_INTELLIGENCE_SEED);
  const [rosterText, setRosterText] = useState(DEFAULT_PUBLIC_ROSTER);
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [selectedOverlapId, setSelectedOverlapId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOverlap = useMemo(() => {
    if (!result) {
      return null;
    }

    return (
      result.overlaps.find((overlap) => overlap.id === selectedOverlapId) ??
      result.overlaps[0] ??
      null
    );
  }, [result, selectedOverlapId]);
  const selectedPerson = selectedOverlap
    ? result?.people.find((person) => person.id === selectedOverlap.publicPersonId) ??
      null
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/intelligence", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          seedQuery,
          rosterText,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "The intelligence run failed.");
      }

      const nextResult = payload as IntelligenceResult;
      setResult(nextResult);
      setSelectedOverlapId(nextResult.overlaps[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-paper)] text-[var(--color-jet-ink)]">
      <div className="mx-auto flex w-full max-w-[var(--page-max-width)] flex-col gap-[28px] px-[16px] pb-[40px] pt-[44px] sm:px-[24px] sm:pt-[56px] lg:px-0 lg:pt-[72px]">
        <section className="grid gap-[28px] lg:grid-cols-[minmax(0,1fr)_520px] lg:items-stretch xl:grid-cols-[minmax(0,1fr)_600px]">
          <div className="flex max-w-[700px] flex-col justify-between">
            <div>
              <h1 className="font-[var(--font-universalsansdisplay)] text-[44px] font-normal leading-none tracking-[-0.025em] text-[var(--color-jet-ink)] sm:text-[56px] lg:text-[64px]">
                People intelligence.
              </h1>
              <p className="mt-5 max-w-[560px] text-base leading-7 text-[var(--color-fog)]">
                Paste a public roster, run it against a seed paper graph, and see
                which people overlap through authorship, coauthors, or public
                institution metadata.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <StatusCard
                icon={<ShieldCheck size={16} strokeWidth={1.8} />}
                label="Works now"
                value="Manual roster + OpenAlex"
              />
              <StatusCard
                icon={<Search size={16} strokeWidth={1.8} />}
                label="Needs provider"
                value="Automatic xAI roster discovery"
              />
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-white p-4"
          >
            <div>
              <label
                htmlFor="intelligence-seed"
                className="text-sm font-medium text-[var(--color-jet-ink)]"
              >
                Seed paper
              </label>
              <input
                id="intelligence-seed"
                value={seedQuery}
                onChange={(event) => setSeedQuery(event.target.value)}
                className="mt-2 h-11 w-full rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-white px-3 text-sm outline-none transition-colors duration-150 ease-[var(--ease-out)] focus:border-[var(--color-jet-ink)]"
                spellCheck={false}
              />
            </div>

            <div className="mt-4">
              <label
                htmlFor="intelligence-roster"
                className="text-sm font-medium text-[var(--color-jet-ink)]"
              >
                Public people roster
              </label>
              <textarea
                id="intelligence-roster"
                value={rosterText}
                onChange={(event) => setRosterText(event.target.value)}
                className="mt-2 h-[156px] w-full resize-none rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-white px-3 py-3 text-sm leading-6 outline-none transition-colors duration-150 ease-[var(--ease-out)] focus:border-[var(--color-jet-ink)]"
                spellCheck={false}
              />
              <p className="mt-2 text-xs leading-5 text-[var(--color-fog)]">
                One per line. Optional format: name | note | source url.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ui-press mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-jet-ink)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              ) : (
                <Network size={16} strokeWidth={1.8} aria-hidden="true" />
              )}
              Run overlap check
            </button>
          </form>
        </section>

        {error ? (
          <div className="flex items-start gap-3 rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-sand)] p-4 text-sm text-[var(--color-jet-ink)]">
            <AlertCircle
              className="mt-0.5 text-[var(--color-jet-ink)]"
              size={18}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">Run failed</p>
              <p className="mt-1 text-[var(--color-steel)]">{error}</p>
            </div>
          </div>
        ) : null}

        {result ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Graph authors" value={result.summary.graphAuthors} />
              <MetricCard label="Public people" value={result.summary.publicPeople} />
              <MetricCard
                label="Resolved"
                value={`${result.summary.resolvedPeople}/${result.summary.publicPeople}`}
              />
              <MetricCard label="Overlap leads" value={result.summary.leads} />
            </section>

            <section className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
              <ResolvedPeople people={result.people} />
              <OverlapList
                overlaps={result.overlaps}
                selectedOverlapId={selectedOverlap?.id ?? null}
                onSelect={setSelectedOverlapId}
              />
              <OverlapDetail overlap={selectedOverlap} person={selectedPerson} />
            </section>

            {result.warnings.length > 0 ? (
              <section className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-4">
                <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                  Run notes
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.warnings.slice(0, 6).map((warning) => (
                    <span
                      key={warning}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-[var(--color-steel)]"
                    >
                      {warning}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <EmptyWorkbench isLoading={isLoading} />
        )}
      </div>
    </main>
  );
}

function StatusCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-smallcards)] bg-[var(--color-cream)] p-4">
      <div className="flex items-center gap-2 text-[var(--color-fog)]">
        {icon}
        <span className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-[var(--color-jet-ink)]">
        {value}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-white p-5">
      <p className="text-sm text-[var(--color-fog)]">{label}</p>
      <p className="mt-4 text-3xl font-normal leading-none text-[var(--color-jet-ink)]">
        {value}
      </p>
    </div>
  );
}

function ResolvedPeople({ people }: { people: IntelligencePerson[] }) {
  return (
    <aside className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-white p-4">
      <div className="flex items-center gap-2">
        <Users size={17} strokeWidth={1.8} aria-hidden="true" />
        <h2 className="text-base font-medium">Resolved people</h2>
      </div>
      <div className="mt-4 space-y-2">
        {people.map((person) => (
          <article
            key={person.id}
            className="rounded-[var(--radius-smallcards)] bg-[var(--color-cream)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-jet-ink)]">
                  {person.name}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--color-fog)]">
                  {person.institutions[0] ?? person.note ?? "No public author match"}
                </p>
              </div>
              <ConfidenceBadge value={person.matchConfidence} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 font-[var(--font-geistmono)] text-[11px] text-[var(--color-fog)]">
              <span>{compactNumber(person.worksCount)} works</span>
              <span>{compactNumber(person.citations)} cites</span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function OverlapList({
  overlaps,
  selectedOverlapId,
  onSelect,
}: {
  overlaps: IntelligenceOverlap[];
  selectedOverlapId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database size={17} strokeWidth={1.8} aria-hidden="true" />
          <h2 className="text-base font-medium">Overlap leads</h2>
        </div>
        <span className="rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-fog)]">
          ranked by evidence
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {overlaps.length > 0 ? (
          overlaps.map((overlap) => (
            <button
              key={overlap.id}
              type="button"
              onClick={() => onSelect(overlap.id)}
              className={`ui-press w-full rounded-[var(--radius-smallcards)] p-4 text-left ${
                selectedOverlapId === overlap.id
                  ? "bg-[var(--color-sand)]"
                  : "bg-[var(--color-cream)] hover:bg-[var(--color-sand)]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--color-fog)]">
                    {overlap.publicPersonName}
                  </p>
                  <p className="mt-1 truncate text-lg font-medium leading-6 text-[var(--color-jet-ink)]">
                    {overlap.researcherName}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-jet-ink)] px-3 py-1.5 font-[var(--font-geistmono)] text-xs text-white">
                  {overlap.score}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {overlap.signals.slice(0, 3).map((signal) => (
                  <span
                    key={`${overlap.id}-${signal.label}`}
                    className="rounded-full bg-white px-2.5 py-1 text-xs text-[var(--color-steel)]"
                  >
                    {signal.label}
                  </span>
                ))}
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-[var(--radius-smallcards)] bg-[var(--color-cream)] p-5 text-sm leading-6 text-[var(--color-steel)]">
            No overlaps found for this roster. Try adding more public people, exact
            OpenAlex author IDs, or names known to publish in this paper area.
          </div>
        )}
      </div>
    </section>
  );
}

function OverlapDetail({
  overlap,
  person,
}: {
  overlap: IntelligenceOverlap | null;
  person: IntelligencePerson | null;
}) {
  if (!overlap) {
    return (
      <aside className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-5">
        <p className="text-sm leading-6 text-[var(--color-steel)]">
          Run the overlap check to inspect evidence here.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-5 lg:sticky lg:top-5">
      <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
        Evidence
      </p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium leading-7">
            {overlap.publicPersonName}
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-fog)]">
            to {overlap.researcherName}
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-jet-ink)] px-3 py-1.5 font-[var(--font-geistmono)] text-xs text-white">
          {overlap.score}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <EvidenceMetric label="Signals" value={overlap.signals.length} />
        <EvidenceMetric
          label="Works"
          value={compactNumber(person?.worksCount ?? 0)}
        />
        <EvidenceMetric
          label="Cites"
          value={compactNumber(person?.citations ?? 0)}
        />
        <EvidenceMetric label="H-index" value={person?.hIndex ?? "unknown"} />
      </div>

      <div className="mt-6 space-y-3">
        {overlap.signals.map((signal) => (
          <section
            key={`${overlap.id}-${signal.kind}-${signal.evidence}`}
            className="rounded-[var(--radius-smallcards)] bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-[var(--color-jet-ink)]">
                {signal.label}
              </h3>
              <span className="font-[var(--font-geistmono)] text-xs text-[var(--color-fog)]">
                +{signal.weight}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-steel)]">
              {signal.evidence}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-fog)]">
                {signal.confidence} confidence
              </span>
              {signal.sourceUrl ? (
                <a
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-press inline-flex items-center gap-1 rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-steel)] hover:text-[var(--color-jet-ink)]"
                >
                  source
                  <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-smallcards)] bg-white px-3 py-2">
      <p className="font-[var(--font-geistmono)] text-[11px] text-[var(--color-fog)]">
        {label}
      </p>
      <p className="mt-1 font-medium text-[var(--color-jet-ink)]">{value}</p>
    </div>
  );
}

function ConfidenceBadge({
  value,
}: {
  value: IntelligencePerson["matchConfidence"];
}) {
  const label =
    value === "resolved" ? "ok" : value === "likely" ? "check" : "miss";
  const className =
    value === "resolved"
      ? "bg-[var(--color-sprout)]/10 text-[var(--color-sprout)]"
      : value === "likely"
        ? "bg-[var(--color-sunbeam)]/15 text-[var(--color-slate)]"
        : "bg-white text-[var(--color-fog)]";

  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function EmptyWorkbench({ isLoading }: { isLoading: boolean }) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-6">
      {isLoading ? (
        <div className="flex items-center gap-3 text-sm text-[var(--color-fog)]">
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          Building graph, resolving people, and scoring overlaps
        </div>
      ) : (
        <div className="max-w-[420px] text-center">
          <Network
            className="mx-auto text-[var(--color-fog)]"
            size={28}
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <h2 className="mt-4 text-xl font-medium">Ready to run</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-fog)]">
            The first run uses the demo roster. Replace it with xAI names or
            OpenAlex author IDs when you have a public roster source.
          </p>
        </div>
      )}
    </section>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
