"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { GraphEdge, GraphNode, GraphResponse } from "@/lib/graph-types";

type PositionedNode = GraphNode & {
  x: number;
  y: number;
  r: number;
};

type SelectedGraphItem =
  | GraphNode
  | NonNullable<GraphResponse["rankedResearchers"]>[number];

type GraphDragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  panX: number;
  panY: number;
};

type PaperSortMode =
  | "citations"
  | "year-desc"
  | "year-asc"
  | "shared"
  | "seed-authors";

const exampleQueries = [
  "https://doi.org/10.1038/nature14539",
  "Attention Is All You Need",
  "https://openalex.org/W2626778328",
];
const GRAPH_WIDTH = 1360;
const GRAPH_HEIGHT = 900;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;
const DEFAULT_GRAPH_SPACING = 1.08;
const MIN_GRAPH_ZOOM = 0.65;
const MAX_GRAPH_ZOOM = 1.75;
const GRAPH_BUILD_LAYER_STEP_MS = 240;
const GRAPH_BUILD_STAGGER_MS = 24;
const TRACKPAD_PAN_LIMIT_X = GRAPH_WIDTH * 0.72;
const TRACKPAD_PAN_LIMIT_Y = GRAPH_HEIGHT * 0.72;
const SKELETON_GRAPH_NODES = [
  { x: 680, y: 450, r: 48, kind: "seed", labelWidth: 112 },
  { x: 520, y: 360, r: 28, kind: "author", labelWidth: 104 },
  { x: 820, y: 370, r: 30, kind: "author", labelWidth: 112 },
  { x: 420, y: 520, r: 22, kind: "work", labelWidth: 84 },
  { x: 940, y: 520, r: 22, kind: "work", labelWidth: 84 },
  { x: 560, y: 610, r: 24, kind: "author", labelWidth: 116 },
  { x: 780, y: 625, r: 24, kind: "work", labelWidth: 88 },
  { x: 370, y: 300, r: 18, kind: "work", labelWidth: 76 },
  { x: 1005, y: 310, r: 18, kind: "author", labelWidth: 96 },
  { x: 690, y: 245, r: 18, kind: "work", labelWidth: 88 },
];
const SKELETON_GRAPH_EDGES = [
  [680, 450, 520, 360],
  [680, 450, 820, 370],
  [680, 450, 420, 520],
  [680, 450, 940, 520],
  [680, 450, 560, 610],
  [680, 450, 780, 625],
  [520, 360, 370, 300],
  [820, 370, 1005, 310],
  [690, 245, 520, 360],
  [690, 245, 820, 370],
];

export default function GraphExplorer() {
  const [query, setQuery] = useState(exampleQueries[0]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDetailActive, setIsDetailActive] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inspectorExitTimerRef = useRef<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    clearInspectorExitTimer();
    setIsDetailActive(false);
    setSelectedId(null);
    setHoveredId(null);

    try {
      const response = await fetch("/api/graph", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          depth: 3,
          breadth: 12,
          includeCitations: true,
          includeSameAuthor: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "The graph request failed.");
      }

      setGraph(payload as GraphResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  const selected = useMemo(() => {
    if (!selectedId || !graph) {
      return null;
    }

    return (
      graph.rankedResearchers.find((researcher) => researcher.id === selectedId) ??
      graph.nodes.find((node) => node.id === selectedId) ??
      null
    );
  }, [graph, selectedId]);
  const detailSelection = selected;

  useEffect(
    () => () => {
      clearInspectorExitTimer();
    },
    [],
  );

  function clearInspectorExitTimer() {
    if (inspectorExitTimerRef.current === null) {
      return;
    }

    window.clearTimeout(inspectorExitTimerRef.current);
    inspectorExitTimerRef.current = null;
  }

  function selectGraphItem(id: string) {
    clearInspectorExitTimer();
    setSelectedId(id);
    setIsDetailActive(true);
  }

  function closeGraphItem() {
    clearInspectorExitTimer();
    setIsDetailActive(false);
    inspectorExitTimerRef.current = window.setTimeout(() => {
      setSelectedId(null);
      inspectorExitTimerRef.current = null;
    }, 360);
  }

  return (
    <main className="min-h-screen bg-[var(--surface-paper)] text-[var(--color-jet-ink)]">
      <div className="mx-auto flex w-full max-w-[var(--page-max-width)] flex-col gap-[32px] px-[16px] pb-[32px] pt-[44px] sm:px-[24px] sm:pt-[56px] lg:px-0 lg:pt-[72px]">
        <nav className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">Researcher Map</span>
          <Link
            href="/connections"
            className="ui-press inline-flex items-center gap-1 text-[var(--color-steel)] hover:text-black"
          >
            Overlap view
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>
        <section className="grid gap-[28px] lg:grid-cols-[minmax(0,1fr)_520px] lg:items-stretch lg:gap-[32px] xl:grid-cols-[minmax(0,1fr)_620px]">
          <div className="max-w-[680px]">
            <h1 className="max-w-[680px] font-[var(--font-universalsansdisplay)] text-[44px] font-normal leading-none tracking-[-0.025em] text-[var(--color-jet-ink)] sm:text-[56px] lg:text-[64px]">
              Map the researchers behind any paper.
            </h1>
          </div>

          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[720px] lg:max-w-none"
          >
            <div className="flex min-h-[112px] flex-col rounded-[24px] border border-[var(--color-dove)] bg-white px-[18px] py-[14px] transition-[border-color] duration-150 ease-[var(--ease-out)] focus-within:border-[var(--color-jet-ink)] sm:min-h-[132px] sm:px-[20px] sm:py-[16px] lg:h-full lg:min-h-0">
              <label
                htmlFor="paper-query"
                className="sr-only"
              >
                Seed paper
              </label>
              <input
                id="paper-query"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-describedby="paper-query-format"
                className="block h-[32px] min-w-0 bg-transparent text-[22px] font-normal leading-none text-[var(--color-jet-ink)] outline-none placeholder:text-[var(--color-pewter)] sm:h-[36px] sm:text-[24px]"
                spellCheck={false}
              />
              <div className="mt-auto flex items-end justify-between gap-[16px] pt-[18px]">
                <p
                  id="paper-query-format"
                  className="pb-[8px] text-[12px] leading-none text-[var(--color-pewter)] sm:text-[13px]"
                >
                  doi / title / openalex
                </p>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="ui-press inline-flex h-[32px] items-center justify-center gap-[6px] rounded-full bg-[var(--color-jet-ink)] px-[12px] text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-[34px] sm:px-[13px] sm:text-[13px]"
                >
                  {isLoading ? (
                    <Loader2
                      className="animate-spin"
                      size={13}
                      aria-hidden="true"
                    />
                  ) : (
                    <Search size={14} strokeWidth={1.9} aria-hidden="true" />
                  )}
                  Build graph
                </button>
              </div>
            </div>
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
              <p className="font-medium">Graph failed</p>
              <p className="mt-1 text-[var(--color-steel)]">{error}</p>
            </div>
          </div>
        ) : null}

        <section
          className={`graph-workspace-grid grid items-start gap-5 pb-8 lg:grid-cols-[minmax(0,1fr)_320px] ${
            detailSelection ? "is-inspector-open" : ""
          }`}
        >
          <section className="overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)]">
            <div className="flex h-[700px] flex-col bg-white">
              <GraphCanvas
                key={graph?.summary.seedUrl ?? "empty-graph"}
                graph={graph}
                selectedId={selectedId}
                highlightedId={hoveredId}
                onSelect={selectGraphItem}
                isLoading={isLoading}
              />
            </div>
          </section>

          <aside className="min-w-0">
            <RankedList
              graph={graph}
              selectedId={selectedId}
              onSelect={selectGraphItem}
            />
          </aside>

          {detailSelection ? (
            <div className="graph-inspector-slot hidden min-w-0 xl:block">
              <div
                className={`graph-inspector-shell ${
                  isDetailActive ? "is-active" : ""
                }`}
              >
                <DetailPanel
                  graph={graph}
                  selected={detailSelection}
                  onSelect={selectGraphItem}
                  onPreview={setHoveredId}
                  onClose={closeGraphItem}
                  className="sticky top-5 max-h-[calc(100vh-40px)] overflow-y-auto"
                />
              </div>
            </div>
          ) : null}
        </section>

        {graph ? (
          <SharedPeopleExplorer
            key={graph.summary.seedUrl}
            graph={graph}
            onSelect={selectGraphItem}
            onPreview={setHoveredId}
          />
        ) : null}

        <MobileDetailSheet
          graph={graph}
          selected={detailSelection}
          isActive={isDetailActive}
          onSelect={selectGraphItem}
          onPreview={setHoveredId}
          onClose={closeGraphItem}
        />
      </div>
    </main>
  );
}

function SharedPeopleExplorer({
  graph,
  onSelect,
  onPreview,
}: {
  graph: GraphResponse;
  onSelect: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const [paperQuery, setPaperQuery] = useState("");
  const [seedFilter, setSeedFilter] = useState("all");
  const [sortMode, setSortMode] = useState<PaperSortMode>("citations");
  const [activeSharedAuthorId, setActiveSharedAuthorId] = useState<string | null>(
    null,
  );

  const activeSharedAuthor =
    graph.sharedAuthors.find((author) => author.id === activeSharedAuthorId) ??
    null;
  const proofPapers = useMemo(
    () => graph.workInsights.filter((work) => work.seedAuthors.length > 0),
    [graph.workInsights],
  );
  const filteredProofPapers = useMemo(() => {
    const normalizedQuery = paperQuery.trim().toLowerCase();

    return proofPapers
      .filter((work) =>
        seedFilter === "all"
          ? true
          : work.seedAuthors.some((author) => author.id === seedFilter),
      )
      .filter((work) =>
        activeSharedAuthorId
          ? work.authors.some((author) => author.id === activeSharedAuthorId)
          : true,
      )
      .filter((work) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          work.label.toLowerCase().includes(normalizedQuery) ||
          work.authors.some((author) =>
            author.name.toLowerCase().includes(normalizedQuery),
          )
        );
      })
      .sort((a, b) => comparePaperInsights(a, b, sortMode));
  }, [
    activeSharedAuthorId,
    paperQuery,
    proofPapers,
    seedFilter,
    sortMode,
  ]);
  const papersWithSharedPeople = proofPapers.filter(
    (work) => work.sharedAuthors.length > 0,
  ).length;
  const strongestPaper = Math.max(
    0,
    ...proofPapers.map((work) => work.sharedAuthors.length),
  );

  return (
    <section className="space-y-5 pb-10">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-4">
          <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
            Seed authors
          </p>
          <h2 className="mt-2 text-2xl font-medium leading-8 text-[var(--color-jet-ink)]">
            {graph.summary.seedTitle}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {graph.seedAuthors.map((author) => (
              <button
                key={author.id}
                type="button"
                onClick={() =>
                  setSeedFilter(seedFilter === author.id ? "all" : author.id)
                }
                className={`ui-press rounded-full border px-3 py-1.5 text-sm ${
                  seedFilter === author.id
                    ? "border-[var(--color-jet-ink)] bg-[var(--color-jet-ink)] text-white"
                    : "border-[var(--color-dove)] bg-white text-[var(--color-jet-ink)]"
                }`}
              >
                {author.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <OverlapMetric label="Shared people" value={graph.sharedAuthors.length} />
          <OverlapMetric
            label="Papers with shared people"
            value={papersWithSharedPeople}
          />
          <OverlapMetric label="Most shared on one paper" value={strongestPaper} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <section className="min-w-0 rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-white">
          <div className="border-b border-[var(--color-dove)] px-4 py-4">
            <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
              Shared people
            </p>
            <h2 className="mt-1 text-2xl font-medium leading-8 text-[var(--color-jet-ink)]">
              Who crosses between seed authors
            </h2>
          </div>

          {graph.sharedAuthors.length > 0 ? (
            <div>
              {graph.sharedAuthors.map((author) => {
                const isActive = activeSharedAuthorId === author.id;
                const bestPaper = author.papers[0];

                return (
                  <button
                    key={author.id}
                    type="button"
                    onClick={() =>
                      setActiveSharedAuthorId(isActive ? null : author.id)
                    }
                    className={`ui-press block w-full border-b border-[var(--color-dove)] px-4 py-4 text-left last:border-b-0 ${
                      isActive ? "bg-[var(--color-sand)]" : "hover:bg-[var(--color-cream)]"
                    }`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[minmax(140px,0.85fr)_minmax(170px,1fr)_84px_minmax(130px,0.8fr)] lg:items-start">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-[var(--color-jet-ink)]">
                          {author.name}
                        </p>
                        <p className="mt-1 truncate text-sm text-[var(--color-fog)]">
                          {author.primaryInstitution}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {author.connectedSeedAuthors.map((seedAuthor) => (
                          <span
                            key={seedAuthor.id}
                            className="rounded-full bg-[var(--color-jet-ink)] px-2.5 py-1 text-xs text-white"
                          >
                            {seedAuthor.name}
                          </span>
                        ))}
                      </div>

                      <MiniMetric label="Papers" value={author.paperCount} />

                      <p className="line-clamp-2 text-sm leading-5 text-[var(--color-steel)]">
                        {bestPaper?.label ?? "No proof papers"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-sm leading-6 text-[var(--color-fog)]">
              No non-seed author appears with more than one seed author in this
              graph.
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-white">
          <div className="border-b border-[var(--color-dove)] px-4 py-4">
            <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
              Seed-author papers
            </p>
            <h2 className="mt-1 text-2xl font-medium leading-8 text-[var(--color-jet-ink)]">
              Papers behind the overlap
            </h2>
          </div>

          <div className="border-b border-[var(--color-dove)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="proof-paper-search" className="sr-only">
                Filter papers
              </label>
              <input
                id="proof-paper-search"
                value={paperQuery}
                onChange={(event) => setPaperQuery(event.target.value)}
                placeholder="Filter papers or people"
                className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-inputs)] border border-[var(--color-dove)] bg-white px-3 text-sm text-[var(--color-jet-ink)] outline-none placeholder:text-[var(--color-pewter)] focus:border-[var(--color-jet-ink)]"
              />
              <label htmlFor="proof-paper-sort" className="sr-only">
                Sort papers
              </label>
              <select
                id="proof-paper-sort"
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as PaperSortMode)
                }
                className="min-h-10 rounded-[var(--radius-inputs)] border border-[var(--color-dove)] bg-white px-3 text-sm text-[var(--color-jet-ink)] outline-none focus:border-[var(--color-jet-ink)]"
              >
                <option value="citations">Most citations</option>
                <option value="year-desc">Newest</option>
                <option value="year-asc">Oldest</option>
                <option value="shared">Most shared people</option>
                <option value="seed-authors">Most seed authors</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSeedFilter("all")}
                className={`ui-press min-h-8 rounded-full border px-3 text-xs font-medium ${
                  seedFilter === "all"
                    ? "border-[var(--color-jet-ink)] bg-[var(--color-jet-ink)] text-white"
                    : "border-[var(--color-dove)] bg-white text-[var(--color-steel)] hover:text-[var(--color-jet-ink)]"
                }`}
              >
                All seed authors
              </button>
              {graph.seedAuthors.map((author) => (
                <button
                  key={author.id}
                  type="button"
                  onClick={() => setSeedFilter(author.id)}
                  className={`ui-press min-h-8 rounded-full border px-3 text-xs font-medium ${
                    seedFilter === author.id
                      ? "border-[var(--color-jet-ink)] bg-[var(--color-jet-ink)] text-white"
                      : "border-[var(--color-dove)] bg-white text-[var(--color-steel)] hover:text-[var(--color-jet-ink)]"
                  }`}
                >
                  {author.name}
                </button>
              ))}
              {activeSharedAuthor ? (
                <button
                  type="button"
                  onClick={() => setActiveSharedAuthorId(null)}
                  className="ui-press inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--color-dove)] bg-[var(--color-sand)] px-3 text-xs font-medium text-[var(--color-jet-ink)]"
                >
                  {activeSharedAuthor.name}
                  <X size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <div>
            {filteredProofPapers.length > 0 ? (
              filteredProofPapers.map((work) => (
                <button
                  key={work.id}
                  type="button"
                  onClick={() => onSelect(work.id)}
                  onPointerEnter={() => onPreview(work.id)}
                  onPointerLeave={() => onPreview(null)}
                  onFocus={() => onPreview(work.id)}
                  onBlur={() => onPreview(null)}
                  className="ui-press block w-full border-b border-[var(--color-dove)] px-4 py-4 text-left last:border-b-0 hover:bg-[var(--color-cream)]"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px]">
                    <div className="min-w-0">
                      <p className="text-base font-medium leading-6 text-[var(--color-jet-ink)]">
                        {work.label}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-fog)]">
                        {[work.year, work.type?.replaceAll("-", " ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniMetric
                        label="Cites"
                        value={compactNumber(work.citations)}
                      />
                      <MiniMetric
                        label="Seed"
                        value={work.connectedSeedAuthorCount}
                      />
                      <MiniMetric label="Shared" value={work.sharedAuthors.length} />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {work.seedAuthors.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-[var(--color-fog)]">
                          Seed
                        </span>
                        {work.seedAuthors.map((author) => (
                          <span
                            key={author.id}
                            className="rounded-full bg-[var(--color-jet-ink)] px-2.5 py-1 text-xs text-white"
                          >
                            {author.name}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {work.sharedAuthors.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-[var(--color-fog)]">
                          Shared
                        </span>
                        {work.sharedAuthors.map((author) => (
                          <span
                            key={author.id}
                            className="rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-steel)]"
                          >
                            {author.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-sm text-[var(--color-fog)]">
                No papers match the current filters.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function OverlapMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-smallcards)] bg-[var(--color-cream)] px-4 py-3">
      <p className="text-xs text-[var(--color-fog)]">{label}</p>
      <p className="mt-1 text-2xl font-medium text-[var(--color-jet-ink)]">
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="rounded-[var(--radius-inputs)] bg-[var(--color-cream)] px-2 py-1.5 text-center">
      <span className="block text-[10px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
        {label}
      </span>
      <span className="mt-0.5 block font-[var(--font-geistmono)] text-xs text-[var(--color-jet-ink)]">
        {value}
      </span>
    </span>
  );
}

function MobileDetailSheet({
  graph,
  selected,
  isActive,
  onSelect,
  onPreview,
  onClose,
}: {
  graph: GraphResponse | null;
  selected: SelectedGraphItem | null;
  isActive: boolean;
  onSelect: (id: string) => void;
  onPreview: (id: string | null) => void;
  onClose: () => void;
}) {
  if (!selected) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`graph-sheet-backdrop fixed inset-0 z-30 bg-white/55 backdrop-blur-[2px] xl:hidden ${
          isActive ? "is-active" : ""
        }`}
        aria-label="Close details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Selected graph item details"
        className={`graph-mobile-sheet fixed inset-x-3 bottom-3 z-40 max-h-[min(78vh,720px)] overflow-hidden rounded-[var(--radius-cards)] shadow-[var(--shadow-xl)] sm:inset-x-6 md:left-1/2 md:right-auto md:w-[min(680px,calc(100vw-48px))] xl:hidden ${
          isActive ? "is-active" : ""
        }`}
      >
        <DetailPanel
          graph={graph}
          selected={selected}
          onSelect={onSelect}
          onPreview={onPreview}
          onClose={onClose}
          className="max-h-[min(78vh,720px)] overflow-y-auto"
        />
      </div>
    </>
  );
}

function RankedList({
  graph,
  selectedId,
  onSelect,
}: {
  graph: GraphResponse | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const maxScore = graph?.rankedResearchers[0]?.score ?? 1;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollHint, setScrollHint] = useState({
    canScroll: false,
    atTop: true,
    atBottom: true,
  });

  useEffect(() => {
    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      return;
    }

    const currentScrollElement = scrollElement;

    function updateScrollHint() {
      const threshold = 4;
      const nextState = {
        canScroll:
          currentScrollElement.scrollHeight >
          currentScrollElement.clientHeight + threshold,
        atTop: currentScrollElement.scrollTop <= threshold,
        atBottom:
          currentScrollElement.scrollTop + currentScrollElement.clientHeight >=
          currentScrollElement.scrollHeight - threshold,
      };

      setScrollHint((current) =>
        current.canScroll === nextState.canScroll &&
        current.atTop === nextState.atTop &&
        current.atBottom === nextState.atBottom
          ? current
          : nextState,
      );
    }

    updateScrollHint();
    currentScrollElement.addEventListener("scroll", updateScrollHint, {
      passive: true,
    });
    window.addEventListener("resize", updateScrollHint);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollHint);
    resizeObserver?.observe(currentScrollElement);

    return () => {
      currentScrollElement.removeEventListener("scroll", updateScrollHint);
      window.removeEventListener("resize", updateScrollHint);
      resizeObserver?.disconnect();
    };
  }, [graph?.rankedResearchers.length, selectedId]);

  return (
    <section
      className={`relative min-h-0 ${
        scrollHint.canScroll ? "lg:pb-[32px]" : ""
      }`}
    >
      <div
        ref={scrollRef}
        className="space-y-4 pr-1 lg:max-h-[700px] lg:overflow-auto lg:pb-10"
      >
        {(graph?.rankedResearchers ?? []).length > 0 ? (
          graph?.rankedResearchers.map((researcher, index) => (
            <button
              key={researcher.id}
              type="button"
              onClick={() => onSelect(researcher.id)}
              className={`ui-press w-full rounded-[var(--radius-smallcards)] p-3 text-left ${
                selectedId === researcher.id
                  ? "border border-[var(--color-dove)] bg-[var(--color-sand)]"
                  : "border border-transparent bg-transparent hover:bg-[var(--color-cream)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--color-dove)] bg-white font-[var(--font-geistmono)] text-[11px] tabular-nums text-[var(--color-fog)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-jet-ink)]">
                      {researcher.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--color-fog)]">
                      {researcher.primaryInstitution}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-[var(--color-jet-ink)] px-2.5 py-1 font-[var(--font-geistmono)] text-[11px] text-white">
                  {researcher.score}
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-sand)]">
                <div
                  className="h-full rounded-full bg-[var(--color-jet-ink)]"
                  style={{
                    width: `${Math.max(8, (researcher.score / maxScore) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 font-[var(--font-geistmono)] text-[11px] text-[var(--color-fog)]">
                <span>{researcher.paperCount} papers</span>
                <span>{compactNumber(researcher.citations)} cites</span>
                <span>{researcher.coauthorCount} ties</span>
              </div>
            </button>
          ))
        ) : (
          <RankedListSkeleton />
        )}
      </div>
      {scrollHint.canScroll ? (
        <>
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 hidden h-8 bg-gradient-to-b from-[var(--surface-paper)] to-transparent transition-opacity duration-150 ease-[var(--ease-out)] lg:block ${
              scrollHint.atTop ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden="true"
          />
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-[32px] hidden h-20 bg-gradient-to-t from-[var(--surface-paper)] via-[var(--surface-paper)]/90 to-transparent transition-opacity duration-150 ease-[var(--ease-out)] lg:block ${
              scrollHint.atBottom ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden="true"
          />
          <div
            className={`pointer-events-none absolute bottom-4 left-1/2 hidden h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-[var(--color-jet-ink)] text-white transition-opacity duration-150 ease-[var(--ease-out)] lg:grid ${
              scrollHint.atBottom ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden="true"
          >
            <ChevronDown size={15} strokeWidth={2} />
          </div>
        </>
      ) : null}
    </section>
  );
}

function RankedListSkeleton() {
  return (
    <div className="space-y-4" aria-label="Ranking preview placeholder">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-smallcards)] p-3"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 gap-3">
              <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-[68%] rounded-full" />
                <SkeletonBlock className="h-3 w-[52%] rounded-full" />
              </div>
            </div>
            <SkeletonBlock className="h-7 w-11 rounded-full" />
          </div>
          <SkeletonBlock className="mt-3 h-1 w-full rounded-full" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <SkeletonBlock className="h-3 rounded-full" />
            <SkeletonBlock className="h-3 rounded-full" />
            <SkeletonBlock className="h-3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({
  graph,
  selected,
  onSelect,
  onPreview,
  onClose,
  className = "",
}: {
  graph: GraphResponse | null;
  selected:
    | GraphNode
    | NonNullable<GraphResponse["rankedResearchers"]>[number]
    | null;
  onSelect: (id: string) => void;
  onPreview: (id: string | null) => void;
  onClose?: () => void;
  className?: string;
}) {
  if (!selected) {
    return null;
  }

  const selectedNode = graph?.nodes.find((node) => node.id === selected.id);
  const selectedResearcher = graph?.rankedResearchers.find(
    (researcher) => researcher.id === selected.id,
  );
  const isResearcher = Boolean(selectedResearcher);
  const fallbackTitle = "label" in selected ? selected.label : selected.name;
  const title = selectedResearcher?.name ?? selectedNode?.label ?? fallbackTitle;
  const subtitle =
    selectedResearcher?.primaryInstitution ??
    selectedNode?.subtitle ??
    ("subtitle" in selected ? selected.subtitle : "");
  const href = selectedResearcher?.url ?? selectedNode?.url ?? selected.url;
  const rank =
    selectedResearcher && graph
      ? graph.rankedResearchers.findIndex(
          (researcher) => researcher.id === selectedResearcher.id,
        ) + 1
      : null;
  const relatedEdges =
    graph?.edges.filter(
      (edge) => edge.source === selected.id || edge.target === selected.id,
    ) ?? [];
  const relatedNodeIds = new Set(
    relatedEdges.map((edge) =>
      edge.source === selected.id ? edge.target : edge.source,
    ),
  );
  const relatedNodes =
    graph?.nodes.filter((node) => relatedNodeIds.has(node.id)) ?? [];
  const connectedAuthors = relatedNodes.filter((node) => node.kind === "author");
  const connectedWorks = relatedNodes.filter((node) => node.kind === "work");
  const workNode =
    !isResearcher && selectedNode?.kind === "work" ? selectedNode : null;
  return (
    <section
      className={`rounded-[var(--radius-cards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
            {selectedResearcher
              ? rank
                ? `Author #${rank}`
                : "Author"
              : workNode?.isSeed
                ? "Seed paper"
                : "Connected paper"}
          </p>
          <h3 className="mt-2 text-lg font-medium leading-6 text-[var(--color-jet-ink)]">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-5 text-[var(--color-fog)]">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ui-press grid h-9 w-9 place-items-center rounded-full border border-[var(--color-dove)] bg-white text-[var(--color-fog)] hover:text-[var(--color-jet-ink)]"
            aria-label="Open source record"
            title="Open source record"
          >
            <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </a>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ui-press grid h-9 w-9 place-items-center rounded-full border border-[var(--color-dove)] bg-white text-[var(--color-fog)] hover:text-[var(--color-jet-ink)]"
              aria-label="Close details"
              title="Close details"
            >
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {selectedResearcher ? (
        <div className="mt-7 space-y-7">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <EvidenceMetric label="Lead score" value={selectedResearcher.score} />
            <EvidenceMetric label="Rank" value={rank ? `#${rank}` : "—"} />
            <EvidenceMetric label="Papers" value={selectedResearcher.paperCount} />
            <EvidenceMetric
              label="Cites"
              value={compactNumber(selectedResearcher.citations)}
            />
            <EvidenceMetric label="Ties" value={selectedResearcher.coauthorCount} />
          </div>
          <div>
            <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
              Evidence papers
            </p>
            <div className="mt-3 space-y-3">
              {connectedWorks.length > 0 ? (
                connectedWorks.slice(0, 3).map((work) => (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() => onSelect(work.id)}
                    onPointerEnter={() => onPreview(work.id)}
                    onPointerLeave={() => onPreview(null)}
                    onFocus={() => onPreview(work.id)}
                    onBlur={() => onPreview(null)}
                    className="block w-full rounded-[var(--radius-smallcards)] bg-white px-3 py-2.5 text-left text-sm leading-5 text-[var(--color-steel)] transition-colors duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-sand)] focus-visible:bg-[var(--color-sand)]"
                  >
                    <span className="block truncate text-[var(--color-jet-ink)]">
                      {work.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-fog)]">
                      {work.subtitle}
                    </span>
                  </button>
                ))
              ) : (
                selectedResearcher.evidence.slice(0, 4).map((line) => (
                  <p
                    key={line}
                    className="border-l border-[var(--color-jet-ink)] pl-3 text-sm leading-5 text-[var(--color-steel)]"
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-7 space-y-7">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <EvidenceMetric
              label="Role"
              value={workNode?.isSeed ? "Seed" : "Connected"}
            />
            <EvidenceMetric
              label="Layer"
              value={
                selectedNode?.depth === 0
                  ? "Origin"
                  : `${selectedNode?.depth ?? 0} hop${
                      selectedNode?.depth === 1 ? "" : "s"
                    }`
              }
            />
            <EvidenceMetric
              label="Cites"
              value={compactNumber(selectedNode?.citations ?? 0)}
            />
            <EvidenceMetric label="Links" value={relatedEdges.length} />
          </div>
          <div>
            <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
              Connected people
            </p>
            <div className="mt-2 space-y-2 text-sm leading-5 text-[var(--color-steel)]">
              {connectedAuthors.length > 0 ? (
                connectedAuthors.slice(0, 4).map((author) => (
                  <button
                    key={author.id}
                    type="button"
                    onClick={() => onSelect(author.id)}
                    onPointerEnter={() => onPreview(author.id)}
                    onPointerLeave={() => onPreview(null)}
                    onFocus={() => onPreview(author.id)}
                    onBlur={() => onPreview(null)}
                    className="block w-full truncate rounded-[var(--radius-smallcards)] bg-white px-3 py-2 text-left transition-colors duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-sand)] focus-visible:bg-[var(--color-sand)]"
                  >
                    {author.label}
                  </button>
                ))
              ) : (
                <p>No connected authors in this view.</p>
              )}
            </div>
          </div>
          {connectedWorks.length > 0 ? (
            <p className="text-xs leading-5 text-[var(--color-fog)]">
              Also connected to {connectedWorks.length} other paper
              {connectedWorks.length === 1 ? "" : "s"} in this map.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-smallcards)] bg-[var(--color-sand)] px-3 py-2">
      <p className="font-[var(--font-geistmono)] text-[11px] text-[var(--color-fog)]">
        {label}
      </p>
      <p className="mt-1 font-medium text-[var(--color-jet-ink)]">{value}</p>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`skeleton-pulse bg-[var(--color-sand)] ${className}`}
      aria-hidden="true"
    />
  );
}

function GraphSkeleton() {
  return (
    <div
      className="relative flex-1 overflow-hidden bg-white"
      aria-label="Graph preview placeholder"
    >
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className="h-full min-h-[700px] w-full"
        aria-hidden="true"
      >
        <g className="skeleton-pulse">
          {SKELETON_GRAPH_EDGES.map(([x1, y1, x2, y2], index) => (
            <line
              key={`${x1}-${y1}-${index}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-dove)"
              strokeOpacity={0.48}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          ))}

          {SKELETON_GRAPH_NODES.map((node, index) => (
            <g key={`${node.x}-${node.y}-${index}`} transform={`translate(${node.x} ${node.y})`}>
              <circle
                r={node.r}
                fill={
                  node.kind === "seed"
                    ? "var(--color-sunbeam)"
                    : node.kind === "author"
                      ? "var(--color-charcoal)"
                      : "var(--color-sand)"
                }
                fillOpacity={node.kind === "author" ? 0.9 : 0.65}
                stroke="var(--color-dove)"
                strokeWidth={node.kind === "seed" ? 3 : 2}
              />
              <rect
                x={-node.labelWidth / 2}
                y={node.r + 8}
                width={node.labelWidth}
                height={18}
                rx={6}
                fill="var(--color-cream)"
                stroke="var(--color-dove)"
                strokeOpacity={0.72}
              />
            </g>
          ))}
        </g>
      </svg>

      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
        <SkeletonLegend width="w-24" />
        <SkeletonLegend width="w-20" />
        <SkeletonLegend width="w-36" />
      </div>
    </div>
  );
}

function SkeletonLegend({ width }: { width: string }) {
  return (
    <div
      className={`skeleton-pulse h-8 rounded-full bg-[var(--color-cream)] ${width}`}
      aria-hidden="true"
    />
  );
}

function GraphCanvas({
  graph,
  selectedId,
  highlightedId,
  onSelect,
  isLoading,
}: {
  graph: GraphResponse | null;
  selectedId: string | null;
  highlightedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const graphSurfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<GraphDragState | null>(null);
  const positioned = useMemo(
    () => layoutGraph(graph, DEFAULT_GRAPH_SPACING),
    [graph],
  );

  useEffect(() => {
    const surface = graphSurfaceRef.current;

    if (!surface || !graph) {
      return;
    }

    const currentSurface = surface;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();

      const isPinchZoom = event.ctrlKey || event.metaKey;
      const isPrecisionTrackpad =
        event.deltaMode === 0 &&
        (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 50);

      if (isPinchZoom || !isPrecisionTrackpad) {
        const direction = event.deltaY > 0 ? -1 : 1;
        const baseStep = isPinchZoom ? 0.028 : 0.036;
        const velocityStep = Math.min(0.045, Math.abs(event.deltaY) * 0.00045);
        const step = Math.max(baseStep, velocityStep);

        setZoom((value) =>
          clamp(
            Number((value + direction * step).toFixed(2)),
            MIN_GRAPH_ZOOM,
            MAX_GRAPH_ZOOM,
          ),
        );
        return;
      }

      const bounds = currentSurface.getBoundingClientRect();
      const svgDeltaX =
        event.deltaX * (GRAPH_WIDTH / Math.max(bounds.width, 1));
      const svgDeltaY =
        event.deltaY * (GRAPH_HEIGHT / Math.max(bounds.height, 1));

      setPan((value) => ({
        x: clamp(value.x - svgDeltaX, -TRACKPAD_PAN_LIMIT_X, TRACKPAD_PAN_LIMIT_X),
        y: clamp(value.y - svgDeltaY, -TRACKPAD_PAN_LIMIT_Y, TRACKPAD_PAN_LIMIT_Y),
      }));
    }

    currentSurface.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      currentSurface.removeEventListener("wheel", handleWheel);
    };
  }, [graph]);

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;

    if (target instanceof Element && target.closest(".graph-node")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsPanning(true);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const dragStart = dragStartRef.current;
    const surface = graphSurfaceRef.current;

    if (!dragStart || dragStart.pointerId !== event.pointerId || !surface) {
      return;
    }

    if (event.buttons === 0) {
      finishCanvasPan(event);
      return;
    }

    event.preventDefault();

    const bounds = surface.getBoundingClientRect();
    const deltaX =
      (event.clientX - dragStart.clientX) *
      (GRAPH_WIDTH / Math.max(bounds.width, 1));
    const deltaY =
      (event.clientY - dragStart.clientY) *
      (GRAPH_HEIGHT / Math.max(bounds.height, 1));

    setPan({
      x: clamp(dragStart.panX + deltaX, -TRACKPAD_PAN_LIMIT_X, TRACKPAD_PAN_LIMIT_X),
      y: clamp(dragStart.panY + deltaY, -TRACKPAD_PAN_LIMIT_Y, TRACKPAD_PAN_LIMIT_Y),
    });
  }

  function finishCanvasPan(event: ReactPointerEvent<SVGSVGElement>) {
    const dragStart = dragStartRef.current;

    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStartRef.current = null;
    setIsPanning(false);
  }

  function handleCanvasDoubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    const target = event.target;

    if (target instanceof Element && target.closest(".graph-node")) {
      return;
    }

    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="animate-spin text-[var(--color-fog)]" size={28} />
      </div>
    );
  }

  if (!graph || positioned.nodes.length === 0) {
    return <GraphSkeleton />;
  }

  const nodeById = new Map(positioned.nodes.map((node) => [node.id, node]));
  const nodeBuildDelays = new Map(
    positioned.nodes.map((node, index) => [
      node.id,
      graphNodeBuildDelay(node, index),
    ]),
  );

  return (
    <div
      ref={graphSurfaceRef}
      className="relative flex-1 touch-none overflow-hidden overscroll-contain"
      aria-label="Graph canvas. Use two-finger trackpad scrolling or drag to pan, and pinch or mouse wheel to zoom."
    >
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className={`h-full min-h-[700px] w-full ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Research paper and author graph"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishCanvasPan}
        onPointerCancel={finishCanvasPan}
        onDoubleClick={handleCanvasDoubleClick}
      >
        <defs>
          <linearGradient id="node-seed-work" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-sunbeam)" />
            <stop offset="100%" stopColor="var(--color-ember)" />
          </linearGradient>
        </defs>

        <g
          transform={`translate(${pan.x} ${pan.y}) translate(${GRAPH_CENTER_X} ${GRAPH_CENTER_Y}) scale(${zoom}) translate(${-GRAPH_CENTER_X} ${-GRAPH_CENTER_Y})`}
        >
          {positioned.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);

            if (!source || !target) {
              return null;
            }

            const active =
              selectedId === source.id ||
              selectedId === target.id ||
              highlightedId === source.id ||
              highlightedId === target.id;
            const edgeDelay = Math.max(
              140,
              Math.max(
                nodeBuildDelays.get(source.id) ?? 0,
                nodeBuildDelays.get(target.id) ?? 0,
              ) - 40,
            );

            return (
              <line
                key={edge.id}
                className="graph-edge"
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edgeColor(edge)}
                strokeOpacity={active ? 0.78 : 0.18}
                strokeWidth={active ? 2.4 : Math.max(1, edge.strength * 0.55)}
                style={{ animationDelay: `${edgeDelay}ms` }}
              />
            );
          })}

          {positioned.nodes.map((node) => {
            const selected = selectedId === node.id;
            const highlighted = highlightedId === node.id;
            const emphasized = selected || highlighted;
            const fill =
              node.kind === "work"
                ? node.isSeed
                  ? "url(#node-seed-work)"
                  : "var(--color-sand)"
                : "var(--color-charcoal)";
            const label = shortLabel(node.label, node.kind === "work" ? 20 : 22);
            const labelWidth = Math.min(176, Math.max(44, label.length * 7.2 + 14));
            const nodeDelay = nodeBuildDelays.get(node.id) ?? 0;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className="graph-node cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={node.label}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <g
                  className={`graph-node-shell ${node.isSeed ? "graph-node-shell-seed" : ""}`}
                  style={{ animationDelay: `${nodeDelay}ms` }}
                >
                  <title>{node.label}</title>
                  <circle
                    className="node-ring"
                    r={node.r + (selected ? 5 : highlighted ? 4 : 0)}
                    fill={emphasized ? nodeSelectedRingFill(node) : "transparent"}
                    opacity={emphasized ? 1 : 0}
                  />
                  <circle
                    r={node.r}
                    fill={fill}
                    stroke={
                      node.kind === "work" && !node.isSeed
                        ? "var(--color-dove)"
                        : "var(--color-paper)"
                    }
                    strokeWidth={node.isSeed ? 4 : 2}
                  />
                  {node.kind === "author" ? (
                    <text
                      y={4}
                      textAnchor="middle"
                      className="pointer-events-none fill-white text-[11px] font-bold"
                    >
                      {initials(node.label)}
                    </text>
                  ) : (
                    <text
                      y={4}
                      textAnchor="middle"
                      className={`pointer-events-none text-[11px] font-bold ${
                        node.isSeed
                          ? "fill-[var(--color-jet-ink)]"
                          : "fill-[var(--foreground)]"
                      }`}
                    >
                      W
                    </text>
                  )}
                  <g
                    className="graph-label pointer-events-none"
                    opacity={
                      node.kind === "author" || node.isSeed || emphasized ? 1 : 0
                    }
                    transform={
                      node.kind === "author" || node.isSeed || emphasized
                        ? "translate(0 0)"
                        : "translate(0 -2)"
                    }
                  >
                    <rect
                      x={-labelWidth / 2}
                      y={node.r + 7}
                      width={labelWidth}
                      height={22}
                      rx={6}
                      fill="rgba(255, 255, 255, 0.92)"
                      stroke="var(--color-dove)"
                    />
                    <text
                      y={node.r + 22}
                      textAnchor="middle"
                      className="fill-[var(--foreground)] text-[11px] font-medium"
                    >
                      {label}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 text-xs text-[var(--color-fog)]">
        <Legend color="var(--color-charcoal)" label="Authors" />
        <Legend color="var(--color-sunbeam)" label="Seed" />
        <Legend color="var(--color-sand)" label="Connected works" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-cream)] px-3 py-1.5 font-[var(--font-geistmono)] text-[11px] backdrop-blur">
      <span
        className="h-2.5 w-2.5 rounded-full border border-[rgba(10,10,10,0.08)]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function graphNodeBuildDelay(node: PositionedNode, index: number) {
  if (node.isSeed) {
    return 0;
  }

  const layer =
    node.kind === "author" && node.depth === 0
      ? 1
      : node.kind === "work"
        ? 2
        : 3;
  const localStagger = (index % 7) * GRAPH_BUILD_STAGGER_MS;

  return layer * GRAPH_BUILD_LAYER_STEP_MS + localStagger;
}

function layoutGraph(graph: GraphResponse | null, spacing: number) {
  if (!graph) {
    return { nodes: [] as PositionedNode[], edges: [] as GraphEdge[] };
  }

  const workNodes = graph.nodes.filter((node) => node.kind === "work");
  const authorNodes = graph.nodes.filter((node) => node.kind === "author");
  const seed = workNodes.find((node) => node.isSeed) ?? workNodes[0];
  const otherWorks = workNodes.filter((node) => node.id !== seed?.id);
  const seedAuthors = authorNodes.filter((node) => node.depth === 0);
  const bridgeAuthors = authorNodes.filter((node) => node.depth !== 0);
  const positioned: PositionedNode[] = [];

  if (seed) {
    positioned.push({ ...seed, x: GRAPH_CENTER_X, y: GRAPH_CENTER_Y, r: 38 });
  }

  positioned.push(
    ...ring(
      seedAuthors,
      GRAPH_CENTER_X,
      GRAPH_CENTER_Y,
      230 * spacing,
      175 * spacing,
      25,
      -Math.PI / 2,
    ),
  );
  positioned.push(
    ...ring(
      otherWorks,
      GRAPH_CENTER_X,
      GRAPH_CENTER_Y,
      425 * spacing,
      300 * spacing,
      20,
      Math.PI / 10,
    ),
  );
  positioned.push(
    ...ring(
      bridgeAuthors,
      GRAPH_CENTER_X,
      GRAPH_CENTER_Y,
      535 * spacing,
      360 * spacing,
      19,
      Math.PI / 5,
    ),
  );

  return {
    nodes: positioned,
    edges: graph.edges,
  };
}

function ring(
  nodes: GraphNode[],
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  nodeRadius: number,
  offset: number,
): PositionedNode[] {
  const count = Math.max(nodes.length, 1);

  return nodes.map((node, index) => {
    const angle = offset + (index / count) * Math.PI * 2;
    const scoreScale = node.score ? Math.min(8, Math.max(0, node.score / 18)) : 0;

    return {
      ...node,
      x: cx + Math.cos(angle) * radiusX,
      y: cy + Math.sin(angle) * radiusY,
      r: node.kind === "author" ? nodeRadius + scoreScale : nodeRadius,
    };
  });
}

function nodeSelectedRingFill(node: PositionedNode) {
  if (node.kind === "work" && node.isSeed) {
    return "rgba(255, 189, 46, 0.28)";
  }

  if (node.kind === "work") {
    return "rgba(242, 237, 229, 0.9)";
  }

  return "rgba(255, 95, 87, 0.18)";
}

function edgeColor(edge: GraphEdge) {
  switch (edge.kind) {
    case "same-author":
      return "var(--color-sunbeam)";
    case "cites-seed":
      return "var(--color-ember)";
    case "related":
      return "var(--color-sprout)";
    case "reference":
      return "var(--color-dove)";
    default:
      return "var(--color-pewter)";
  }
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function comparePaperInsights(
  first: GraphResponse["workInsights"][number],
  second: GraphResponse["workInsights"][number],
  sortMode: PaperSortMode,
) {
  switch (sortMode) {
    case "year-desc":
      return (
        (second.year ?? 0) - (first.year ?? 0) ||
        second.citations - first.citations
      );
    case "year-asc":
      return (
        (first.year ?? 9999) - (second.year ?? 9999) ||
        second.citations - first.citations
      );
    case "shared":
      return (
        second.sharedAuthors.length - first.sharedAuthors.length ||
        second.citations - first.citations
      );
    case "seed-authors":
      return (
        second.connectedSeedAuthorCount - first.connectedSeedAuthorCount ||
        second.citations - first.citations
      );
    case "citations":
    default:
      return (
        second.citations - first.citations ||
        second.sharedAuthors.length - first.sharedAuthors.length
      );
  }
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shortLabel(label: string, maxLength = 22) {
  const cleaned = label.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 3)}...`;
}
