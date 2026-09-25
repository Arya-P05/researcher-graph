"use client";

import Link from "next/link";
import { ArrowUpRight, LoaderCircle, Search } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AuthorOverlapResponse,
  OverlapPaper,
} from "@/lib/author-overlap-types";

type SortMode = "degree" | "citations" | "year-desc" | "year-asc";

const DEFAULT_QUERY = "https://doi.org/10.1038/nature14539";
const PAPER_PREVIEW_COUNT = 8;
const PEOPLE_PAGE_SIZE = 10;

export default function OverlapHome() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [result, setResult] = useState<AuthorOverlapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("degree");
  const [seedAuthorFilter, setSeedAuthorFilter] = useState("all");
  const [sharedAuthorFilter, setSharedAuthorFilter] = useState("all");
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(PEOPLE_PAGE_SIZE);
  const hasLoadedDefault = useRef(false);

  const runQuery = useCallback(async (paperQuery: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/author-overlap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: paperQuery }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not analyze this paper.");
      }

      setResult(payload as AuthorOverlapResponse);
      setSortMode("degree");
      setSeedAuthorFilter("all");
      setSharedAuthorFilter("all");
      setVisiblePeopleCount(PEOPLE_PAGE_SIZE);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedDefault.current) {
      return;
    }

    hasLoadedDefault.current = true;
    void runQuery(DEFAULT_QUERY);
  }, [runQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runQuery(query);
  }

  const filteredPapers = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.papers
      .filter((paper) => paper.sharedAuthorCount > 0)
      .filter((paper) =>
        seedAuthorFilter === "all"
          ? true
          : paper.seedAuthors.some((author) => author.id === seedAuthorFilter),
      )
      .filter((paper) =>
        sharedAuthorFilter === "all"
          ? true
          : paper.sharedAuthors.some((author) => author.id === sharedAuthorFilter),
      )
      .sort((first, second) => comparePapers(first, second, sortMode));
  }, [result, seedAuthorFilter, sharedAuthorFilter, sortMode]);

  const activeSharedAuthor = result?.sharedAuthors.find(
    (author) => author.id === sharedAuthorFilter,
  );

  return (
    <main className="min-h-screen bg-white text-[var(--color-jet-ink)]">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <header>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Researcher Map</p>
            <Link
              href="/overlap"
              className="ui-press inline-flex items-center gap-1 text-sm text-[var(--color-steel)] hover:text-black"
            >
              Full analysis
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-12 max-w-[760px] sm:mt-16">
            <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
              Two-hop coauthor discovery
            </p>
            <h1 className="mt-3 font-[var(--font-universalsansdisplay)] text-[40px] font-normal leading-[1.04] sm:text-[54px]">
              Find who connects the authors behind a paper.
            </h1>
            <p className="mt-4 max-w-[620px] text-[15px] leading-6 text-[var(--color-steel)] sm:text-base">
              Enter any paper to find its authors, scan their publication
              histories, and surface the people and papers they share.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col gap-2 rounded-lg border border-[var(--color-dove)] bg-[var(--color-cream)] p-2 sm:flex-row"
          >
            <label htmlFor="paper-search" className="sr-only">
              DOI, paper title, or OpenAlex URL
            </label>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-white px-3">
              <Search size={16} className="shrink-0 text-[var(--color-fog)]" aria-hidden="true" />
              <input
                id="paper-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="DOI, paper title, or OpenAlex URL"
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-pewter)]"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="ui-press inline-flex h-12 items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
              {isLoading ? "Analyzing" : "Analyze paper"}
            </button>
          </form>

          {isLoading ? (
            <p className="mt-3 text-sm text-[var(--color-fog)]">
              Finding every author and scanning their OpenAlex paper histories...
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </header>

        {result ? (
          <div className={`mt-10 space-y-6 ${isLoading ? "opacity-50" : "opacity-100"}`}>
            <section className="overflow-hidden rounded-lg border border-[var(--color-dove)]">
              <div className="p-5 sm:p-6">
                <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                  Seed paper
                </p>
                <h2 className="mt-2 text-2xl font-medium leading-8">
                  {result.summary.seedTitle}
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.seedAuthors.map((author) => (
                    <button
                      key={author.id}
                      type="button"
                      onClick={() =>
                        setSeedAuthorFilter(
                          seedAuthorFilter === author.id ? "all" : author.id,
                        )
                      }
                      className={`ui-press rounded-full border px-3 py-1.5 text-sm ${
                        seedAuthorFilter === author.id
                          ? "border-black bg-black text-white"
                          : "border-[var(--color-dove)] bg-white hover:border-black"
                      }`}
                    >
                      {author.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid border-t border-[var(--color-dove)] sm:grid-cols-3">
                <Metric label="Papers scanned" value={result.summary.papersFetched} />
                <Metric label="Shared people found" value={result.summary.sharedAuthors} />
                <Metric
                  label="Papers proving overlap"
                  value={result.summary.papersWithSharedAuthors}
                />
              </div>
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.25fr]">
              <section className="overflow-hidden rounded-lg border border-[var(--color-dove)] bg-white">
                <div className="flex items-end justify-between gap-4 border-b border-[var(--color-dove)] p-4">
                  <div>
                    <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                      Strongest overlaps
                    </p>
                    <h2 className="mt-1 text-xl font-medium">People connecting the authors</h2>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--color-fog)]">
                    Top {Math.min(visiblePeopleCount, result.sharedAuthors.length)}
                  </span>
                </div>

                <div>
                  {result.sharedAuthors.slice(0, visiblePeopleCount).map((author, index) => {
                    const isActive = sharedAuthorFilter === author.id;

                    return (
                      <button
                        key={author.id}
                        type="button"
                        onClick={() => setSharedAuthorFilter(isActive ? "all" : author.id)}
                        className={`ui-press grid w-full grid-cols-[28px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--color-dove)] p-4 text-left last:border-b-0 ${
                          isActive ? "bg-[var(--color-sand)]" : "hover:bg-[var(--color-cream)]"
                        }`}
                      >
                        <span className="font-[var(--font-geistmono)] text-xs text-[var(--color-fog)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{author.name}</span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--color-fog)]">
                            Connects {author.connectedSeedAuthors.length} of {result.seedAuthors.length} seed authors
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--color-steel)]">
                            {author.papers[0]?.title ?? "No proof paper"}
                          </span>
                        </span>
                        <span className="rounded-md bg-[var(--color-cream)] px-2 py-1 text-center">
                          <span className="block font-[var(--font-geistmono)] text-sm">{author.paperCount}</span>
                          <span className="block text-[10px] text-[var(--color-fog)]">papers</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {result.sharedAuthors.length > PEOPLE_PAGE_SIZE ? (
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--color-dove)] bg-[var(--color-cream)] px-4 py-3 text-xs text-[var(--color-fog)]">
                    <span>
                      Showing {Math.min(visiblePeopleCount, result.sharedAuthors.length)} of {formatNumber(result.sharedAuthors.length)} people
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisiblePeopleCount((current) =>
                          current >= result.sharedAuthors.length
                            ? PEOPLE_PAGE_SIZE
                            : Math.min(current + PEOPLE_PAGE_SIZE, result.sharedAuthors.length),
                        )
                      }
                      className="ui-press font-medium text-black underline underline-offset-4"
                    >
                      {visiblePeopleCount >= result.sharedAuthors.length
                        ? "Show fewer"
                        : `Show ${Math.min(PEOPLE_PAGE_SIZE, result.sharedAuthors.length - visiblePeopleCount)} more`}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-lg border border-[var(--color-dove)] bg-white">
                <div className="border-b border-[var(--color-dove)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                        Research papers
                      </p>
                      <h2 className="mt-1 text-xl font-medium">Papers behind the overlap</h2>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[var(--color-fog)]">
                      Sort
                      <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as SortMode)}
                        className="h-9 rounded-md border border-[var(--color-dove)] bg-white px-2 text-sm text-black outline-none focus:border-black"
                      >
                        <option value="degree">Most connected</option>
                        <option value="citations">Most citations</option>
                        <option value="year-desc">Newest</option>
                        <option value="year-asc">Oldest</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeedAuthorFilter("all")}
                      className={`ui-press rounded-full border px-2.5 py-1 text-xs ${
                        seedAuthorFilter === "all"
                          ? "border-black bg-black text-white"
                          : "border-[var(--color-dove)]"
                      }`}
                    >
                      All seed authors
                    </button>
                    {result.seedAuthors.map((author) => (
                      <button
                        key={author.id}
                        type="button"
                        onClick={() => setSeedAuthorFilter(author.id)}
                        className={`ui-press rounded-full border px-2.5 py-1 text-xs ${
                          seedAuthorFilter === author.id
                            ? "border-black bg-black text-white"
                            : "border-[var(--color-dove)]"
                        }`}
                      >
                        {author.name}
                      </button>
                    ))}
                    {activeSharedAuthor ? (
                      <button
                        type="button"
                        onClick={() => setSharedAuthorFilter("all")}
                        className="ui-press rounded-full border border-black bg-[var(--color-sand)] px-2.5 py-1 text-xs"
                      >
                        {activeSharedAuthor.name} ×
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  {filteredPapers.slice(0, PAPER_PREVIEW_COUNT).map((paper) => (
                    <PaperRow key={paper.id} paper={paper} />
                  ))}
                  {filteredPapers.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--color-fog)]">
                      No overlap papers match this filter.
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--color-dove)] bg-[var(--color-cream)] px-4 py-3 text-xs text-[var(--color-fog)]">
                  <span>
                    Showing {Math.min(PAPER_PREVIEW_COUNT, filteredPapers.length)} of {formatNumber(filteredPapers.length)} papers
                  </span>
                  <Link href="/overlap" className="ui-press font-medium text-black underline underline-offset-4">
                    Explore all
                  </Link>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-[var(--color-dove)] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-[var(--color-fog)]">{label}</p>
      <p className="mt-1 font-[var(--font-geistmono)] text-2xl">{formatNumber(value)}</p>
    </div>
  );
}

function PaperRow({ paper }: { paper: OverlapPaper }) {
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noreferrer"
      className="ui-press block border-b border-[var(--color-dove)] p-4 last:border-b-0 hover:bg-[var(--color-cream)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium leading-5">{paper.title}</p>
          <p className="mt-1 text-xs text-[var(--color-fog)]">
            {[paper.year, paper.type?.replaceAll("-", " ")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-[var(--color-fog)]" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-md bg-[var(--color-cream)] px-2 py-1">
          {formatNumber(paper.citations)} citations
        </span>
        <span className="rounded-md bg-[var(--color-cream)] px-2 py-1">
          {paper.seedAuthorCount} seed {paper.seedAuthorCount === 1 ? "author" : "authors"}
        </span>
        <span className="rounded-md bg-[var(--color-sand)] px-2 py-1">
          {paper.sharedAuthorCount} shared
        </span>
      </div>
    </a>
  );
}

function comparePapers(first: OverlapPaper, second: OverlapPaper, mode: SortMode) {
  switch (mode) {
    case "citations":
      return second.citations - first.citations || second.degree - first.degree;
    case "year-desc":
      return (second.year ?? 0) - (first.year ?? 0) || second.citations - first.citations;
    case "year-asc":
      return (first.year ?? 9999) - (second.year ?? 9999) || second.citations - first.citations;
    case "degree":
    default:
      return second.degree - first.degree || second.citations - first.citations;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
