"use client";

import Link from "next/link";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
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
  SharedOverlapAuthor,
} from "@/lib/author-overlap-types";

type AuthorSortMode = "overlaps" | "citations" | "papers" | "recent" | "name";
type ProofPaperSortMode = "citations" | "year-desc" | "year-asc" | "seed-authors";
type ProofPaper = SharedOverlapAuthor["papers"][number];

const DEFAULT_QUERY = "https://doi.org/10.1038/nature14539";
const PROOF_PAPER_PREVIEW_COUNT = 5;
const PEOPLE_PAGE_SIZE = 10;

export default function OverlapHome({
  embedded = false,
  initialQuery = DEFAULT_QUERY,
}: {
  embedded?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<AuthorOverlapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorSortMode, setAuthorSortMode] =
    useState<AuthorSortMode>("overlaps");
  const [proofPaperSortMode, setProofPaperSortMode] =
    useState<ProofPaperSortMode>("citations");
  const [seedAuthorFilter, setSeedAuthorFilter] = useState("all");
  const [sharedAuthorFilter, setSharedAuthorFilter] = useState("all");
  const [authorSearch, setAuthorSearch] = useState("");
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(PEOPLE_PAGE_SIZE);
  const [visibleProofPaperCount, setVisibleProofPaperCount] = useState(
    PROOF_PAPER_PREVIEW_COUNT,
  );
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

      const overlapResult = payload as AuthorOverlapResponse;

      setResult(overlapResult);
      setAuthorSortMode("overlaps");
      setProofPaperSortMode("citations");
      setSeedAuthorFilter("all");
      setSharedAuthorFilter(overlapResult.sharedAuthors[0]?.id ?? "all");
      setAuthorSearch("");
      setVisiblePeopleCount(PEOPLE_PAGE_SIZE);
      setVisibleProofPaperCount(PROOF_PAPER_PREVIEW_COUNT);
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
    void runQuery(initialQuery);
  }, [initialQuery, runQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runQuery(query);
  }

  const filteredAuthors = useMemo(() => {
    if (!result) {
      return [];
    }

    const normalizedSearch = authorSearch.trim().toLowerCase();

    return result.sharedAuthors
      .filter((author) =>
        seedAuthorFilter === "all"
          ? true
          : author.connectedSeedAuthors.some(
              (seedAuthor) => seedAuthor.id === seedAuthorFilter,
            ),
      )
      .filter((author) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          author.name.toLowerCase().includes(normalizedSearch) ||
          (author.primaryInstitution ?? "")
            .toLowerCase()
            .includes(normalizedSearch) ||
          author.connectedSeedAuthors.some((seedAuthor) =>
            seedAuthor.name.toLowerCase().includes(normalizedSearch),
          ) ||
          author.papers.some((paper) =>
            paper.title.toLowerCase().includes(normalizedSearch),
          )
        );
      })
      .sort((first, second) =>
        compareSharedAuthors(first, second, authorSortMode),
      );
  }, [authorSearch, authorSortMode, result, seedAuthorFilter]);

  const visibleAuthors = filteredAuthors.slice(0, visiblePeopleCount);
  const activeSharedAuthor =
    sharedAuthorFilter === "all"
      ? null
      : filteredAuthors.find((author) => author.id === sharedAuthorFilter) ?? null;
  const sortedProofPapers = useMemo(() => {
    if (!activeSharedAuthor) {
      return [];
    }

    return [...activeSharedAuthor.papers].sort((first, second) =>
      compareProofPapers(first, second, proofPaperSortMode),
    );
  }, [activeSharedAuthor, proofPaperSortMode]);
  const visibleProofPapers = sortedProofPapers.slice(0, visibleProofPaperCount);

  return (
    <main
      className={
        embedded
          ? "text-[var(--color-jet-ink)]"
          : "min-h-screen bg-white text-[var(--color-jet-ink)]"
      }
    >
      <div
        className={
          embedded
            ? "w-full pb-10"
            : "mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12"
        }
      >
        {!embedded ? (
          <header>
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="ui-press text-sm font-medium">
              Researcher Map
            </Link>
            <nav className="flex items-center gap-4 text-sm text-[var(--color-steel)]">
              <Link href="/" className="ui-press hover:text-black">
                Graph view
              </Link>
              <Link
                href="/overlap"
                className="ui-press inline-flex items-center gap-1 hover:text-black"
              >
                Full analysis
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </nav>
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
        ) : (
          <header className="space-y-[16px]">
            <div className="flex flex-col gap-[16px] sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                  overlap analysis
                </p>
                <h2 className="mt-[4px] text-[24px] font-medium leading-[32px]">
                  People and papers shared across the seed authors
                </h2>
              </div>
              <Link
                href="/connections"
                className="ui-press inline-flex items-center gap-[4px] text-sm text-[var(--color-steel)] hover:text-black"
              >
                Open focused view
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {isLoading ? <OverlapLoadingPanel /> : null}
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
          </header>
        )}

        {result ? (
          <div
            className={`${embedded ? "mt-5" : "mt-10"} space-y-6 ${
              isLoading ? "opacity-50" : "opacity-100"
            }`}
          >
            <section className="overflow-hidden rounded-lg border border-[var(--color-dove)]">
              <div className="p-5 sm:p-6">
                <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                  Seed paper
                </p>
                <h2 className="mt-[8px] text-[24px] font-medium leading-[32px]">
                  {result.summary.seedTitle}
                </h2>
                <p className="mt-[16px] text-sm leading-6 text-[var(--color-steel)]">
                  Seed authors:{" "}
                  {result.seedAuthors.map((author, index) => (
                    <span key={author.id}>
                      {index > 0 ? ", " : ""}
                      <a
                        href={author.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ui-press text-black underline underline-offset-4 hover:text-[var(--color-steel)]"
                      >
                        {author.name}
                      </a>
                    </span>
                  ))}
                </p>
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

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
              <section className="overflow-hidden rounded-lg border border-[var(--color-dove)] bg-white">
                <div className="border-b border-[var(--color-dove)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-xl font-medium">Overlapping authors</h2>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_190px]">
                    <label className="relative block">
                      <span className="sr-only">Find an overlapping author</span>
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fog)]"
                        aria-hidden="true"
                      />
                      <input
                        value={authorSearch}
                        onChange={(event) => {
                          setAuthorSearch(event.target.value);
                          setVisiblePeopleCount(PEOPLE_PAGE_SIZE);
                        }}
                        placeholder="Find author or paper"
                        className="h-10 w-full rounded-md border border-[var(--color-dove)] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[var(--color-pewter)] focus:border-black"
                      />
                    </label>

                    <label className="block">
                      <span className="sr-only">Sort overlapping authors</span>
                      <select
                        value={authorSortMode}
                        onChange={(event) => {
                          setAuthorSortMode(event.target.value as AuthorSortMode);
                          setVisiblePeopleCount(PEOPLE_PAGE_SIZE);
                        }}
                        className="h-10 w-full rounded-md border border-[var(--color-dove)] bg-white px-3 text-sm text-black outline-none focus:border-black"
                      >
                        <option value="overlaps">Most overlaps</option>
                        <option value="citations">Most citations</option>
                        <option value="papers">Most papers</option>
                        <option value="recent">Most recent</option>
                        <option value="name">A to Z</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="sr-only">Filter by seed author</span>
                      <select
                        value={seedAuthorFilter}
                        onChange={(event) => {
                          setSeedAuthorFilter(event.target.value);
                          setSharedAuthorFilter("all");
                          setVisiblePeopleCount(PEOPLE_PAGE_SIZE);
                          setVisibleProofPaperCount(PROOF_PAPER_PREVIEW_COUNT);
                        }}
                        className="h-10 w-full rounded-md border border-[var(--color-dove)] bg-white px-3 text-sm text-black outline-none focus:border-black"
                      >
                        <option value="all">Any seed author</option>
                        {result.seedAuthors.map((author) => (
                          <option key={author.id} value={author.id}>
                            {author.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div>
                  {visibleAuthors.map((author, index) => {
                    const isActive = sharedAuthorFilter === author.id;
                    const latestYear = latestAuthorPaperYear(author);

                    return (
                      <article
                        key={author.id}
                        className="border-b border-[var(--color-dove)] last:border-b-0"
                      >
                        <button
                          type="button"
                          aria-expanded={isActive}
                          onClick={() => {
                            setSharedAuthorFilter(isActive ? "all" : author.id);
                            setVisibleProofPaperCount(PROOF_PAPER_PREVIEW_COUNT);
                          }}
                          className={`ui-press grid w-full grid-cols-[32px_minmax(0,1fr)_auto] gap-3 p-4 text-left ${
                            isActive ? "bg-[var(--color-sand)]" : "hover:bg-[var(--color-cream)]"
                          }`}
                        >
                          <span className="font-[var(--font-geistmono)] text-xs text-[var(--color-fog)]">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-base font-medium">
                              {author.name}
                            </span>
                            <span className="mt-1 block truncate text-xs text-[var(--color-fog)]">
                              {author.primaryInstitution ?? "Unknown institution"}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              {author.connectedSeedAuthors.map((seedAuthor) => (
                                <span
                                  key={seedAuthor.id}
                                  className="rounded-full bg-[var(--color-cream)] px-2 py-1 text-[11px] text-[var(--color-steel)]"
                                >
                                  {seedAuthor.name}
                                </span>
                              ))}
                            </span>
                          </span>
                          <span className="grid grid-cols-[64px] items-center gap-2 text-right text-[11px] text-[var(--color-fog)] sm:grid-cols-[64px_72px_58px]">
                            <span>
                              <span className="block font-[var(--font-geistmono)] text-sm text-black">
                                {author.connectedSeedAuthors.length}/{result.seedAuthors.length}
                              </span>
                              overlaps
                            </span>
                            <span className="hidden sm:block">
                              <span className="block font-[var(--font-geistmono)] text-sm text-black">
                                {formatNumber(author.totalCitations)}
                              </span>
                              cites
                            </span>
                            <span className="hidden sm:block">
                              <span className="block font-[var(--font-geistmono)] text-sm text-black">
                                {latestYear || "-"}
                              </span>
                              latest
                            </span>
                          </span>
                        </button>

                        {isActive ? (
                          <div className="border-t border-[var(--color-dove)] bg-[var(--color-cream)] px-4 py-3 lg:hidden">
                            <p className="text-xs font-medium text-[var(--color-steel)]">
                              Papers this author overlaps on
                            </p>
                            <div className="mt-2 space-y-2">
                              {visibleProofPapers.map((paper) => (
                                <ProofPaperRow key={paper.id} paper={paper} compact />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}

                  {filteredAuthors.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--color-fog)]">
                      No overlapping authors match those filters.
                    </p>
                  ) : null}
                </div>

                {filteredAuthors.length > PEOPLE_PAGE_SIZE ? (
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--color-dove)] bg-[var(--color-cream)] px-4 py-3 text-xs text-[var(--color-fog)]">
                    <span>
                      Showing {Math.min(visiblePeopleCount, filteredAuthors.length)} of {formatNumber(filteredAuthors.length)} people
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisiblePeopleCount((current) =>
                          current >= filteredAuthors.length
                            ? PEOPLE_PAGE_SIZE
                            : Math.min(current + PEOPLE_PAGE_SIZE, filteredAuthors.length),
                        )
                      }
                      className="ui-press font-medium text-black underline underline-offset-4"
                    >
                      {visiblePeopleCount >= filteredAuthors.length
                        ? "Show fewer"
                        : `Show ${Math.min(PEOPLE_PAGE_SIZE, filteredAuthors.length - visiblePeopleCount)} more`}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-lg border border-[var(--color-dove)] bg-white lg:sticky lg:top-4">
                {activeSharedAuthor ? (
                  <>
                    <div className="border-b border-[var(--color-dove)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                            Selected author
                          </p>
                          <a
                            href={activeSharedAuthor.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ui-press mt-1 inline-flex max-w-full items-center gap-1 text-xl font-medium hover:underline"
                          >
                            <span className="truncate">{activeSharedAuthor.name}</span>
                            <ArrowUpRight
                              size={15}
                              className="shrink-0 text-[var(--color-fog)]"
                              aria-hidden="true"
                            />
                          </a>
                          <p className="mt-1 truncate text-sm text-[var(--color-fog)]">
                            {activeSharedAuthor.primaryInstitution ?? "Unknown institution"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSharedAuthorFilter("all")}
                          className="ui-press rounded-full border border-[var(--color-dove)] p-2 text-[var(--color-fog)] hover:border-black hover:text-black"
                          aria-label="Clear selected author"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 border-y border-[var(--color-dove)] text-center">
                        <DetailMetric
                          label="Overlaps"
                          value={`${activeSharedAuthor.connectedSeedAuthors.length}/${result.seedAuthors.length}`}
                        />
                        <DetailMetric
                          label="Papers"
                          value={formatNumber(activeSharedAuthor.paperCount)}
                        />
                        <DetailMetric
                          label="Citations"
                          value={formatNumber(activeSharedAuthor.totalCitations)}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {activeSharedAuthor.connectedSeedAuthors.map((seedAuthor) => (
                          <span
                            key={seedAuthor.id}
                            className="rounded-full bg-[var(--color-jet-ink)] px-2.5 py-1 text-xs text-white"
                          >
                            {seedAuthor.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-dove)] p-4">
                      <div>
                        <p className="text-sm font-medium">Overlap papers</p>
                        <p className="mt-1 text-xs text-[var(--color-fog)]">
                          Papers where this person appears with seed authors.
                        </p>
                      </div>
                      <label>
                        <span className="sr-only">Sort selected author papers</span>
                        <select
                          value={proofPaperSortMode}
                          onChange={(event) =>
                            setProofPaperSortMode(
                              event.target.value as ProofPaperSortMode,
                            )
                          }
                          className="h-9 rounded-md border border-[var(--color-dove)] bg-white px-2 text-sm text-black outline-none focus:border-black"
                        >
                          <option value="citations">Most citations</option>
                          <option value="year-desc">Newest</option>
                          <option value="year-asc">Oldest</option>
                          <option value="seed-authors">Most seed authors</option>
                        </select>
                      </label>
                    </div>

                    <div>
                      {visibleProofPapers.map((paper) => (
                        <ProofPaperRow key={paper.id} paper={paper} />
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-[var(--color-dove)] bg-[var(--color-cream)] px-4 py-3 text-xs text-[var(--color-fog)]">
                      <span>
                        Showing {Math.min(visibleProofPaperCount, sortedProofPapers.length)} of {formatNumber(sortedProofPapers.length)} papers
                      </span>
                      {sortedProofPapers.length > PROOF_PAPER_PREVIEW_COUNT ? (
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleProofPaperCount((current) =>
                              current >= sortedProofPapers.length
                                ? PROOF_PAPER_PREVIEW_COUNT
                                : sortedProofPapers.length,
                            )
                          }
                          className="ui-press font-medium text-black underline underline-offset-4"
                        >
                          {visibleProofPaperCount >= sortedProofPapers.length
                            ? "Show fewer"
                            : "Show all"}
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="p-5">
                    <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
                      Select an author
                    </p>
                    <h2 className="mt-1 text-xl font-medium">
                      No author selected
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--color-steel)]">
                      Author details and proof papers will appear here.
                    </p>
                  </div>
                )}
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
    <div className="relative border-b border-[var(--color-dove)] px-5 py-[18px] last:border-b-0 sm:border-b-0 sm:px-8 sm:py-5 sm:after:absolute sm:after:inset-y-[18px] sm:after:right-0 sm:after:w-px sm:after:bg-[var(--color-dove)] sm:last:after:hidden">
      <p className="text-[13px] leading-5 text-[var(--color-fog)]">{label}</p>
      <p className="mt-[6px] font-[var(--font-geistmono)] text-[28px] leading-none text-black">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function OverlapLoadingPanel() {
  return (
    <section
      aria-label="Overlap analysis loading"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-white"
      role="status"
    >
      <div className="overlap-loading-rail" aria-hidden="true" />
      <div className="grid gap-[16px] p-[16px] sm:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex items-center gap-[8px] text-sm font-medium text-[var(--color-jet-ink)]">
            <LoaderCircle
              className="overlap-loading-spinner shrink-0"
              size={16}
              aria-hidden="true"
            />
            Scanning complete author histories
          </div>
          <p className="mt-[6px] text-sm leading-6 text-[var(--color-steel)]">
            Pulling papers, coauthors, and overlap evidence from OpenAlex.
          </p>
          <div className="mt-[16px] grid gap-[10px]" aria-hidden="true">
            <div className="flex items-center gap-[10px]">
              <span className="skeleton-pulse h-[28px] w-[28px] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[56%] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[18%] rounded-full bg-[var(--color-cream)]" />
            </div>
            <div className="flex items-center gap-[10px]">
              <span className="skeleton-pulse h-[28px] w-[28px] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[42%] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[24%] rounded-full bg-[var(--color-cream)]" />
            </div>
            <div className="flex items-center gap-[10px]">
              <span className="skeleton-pulse h-[28px] w-[28px] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[50%] rounded-full bg-[var(--color-sand)]" />
              <span className="skeleton-pulse h-[10px] w-[14%] rounded-full bg-[var(--color-cream)]" />
            </div>
          </div>
        </div>
        <div className="rounded-[var(--radius-smallcards)] border border-[var(--color-dove)] bg-[var(--color-cream)] p-[12px]">
          <p className="font-[var(--font-geistmono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-fog)]">
            Preparing
          </p>
          <div className="mt-[10px] grid gap-[8px] text-xs text-[var(--color-steel)]">
            <span className="flex items-center justify-between gap-[12px]">
              Shared people
              <span className="skeleton-pulse h-[8px] w-[48px] rounded-full bg-white" />
            </span>
            <span className="flex items-center justify-between gap-[12px]">
              Proof papers
              <span className="skeleton-pulse h-[8px] w-[64px] rounded-full bg-white" />
            </span>
            <span className="flex items-center justify-between gap-[12px]">
              Seed summary
              <span className="skeleton-pulse h-[8px] w-[40px] rounded-full bg-white" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[var(--color-dove)] py-3 last:border-r-0">
      <p className="font-[var(--font-geistmono)] text-base text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-[var(--color-fog)]">{label}</p>
    </div>
  );
}

function ProofPaperRow({
  paper,
  compact = false,
}: {
  paper: ProofPaper;
  compact?: boolean;
}) {
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noreferrer"
      className={`ui-press block border-b border-[var(--color-dove)] last:border-b-0 hover:bg-[var(--color-cream)] ${
        compact ? "rounded-md border bg-white p-3" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium leading-5">{paper.title}</p>
          <p className="mt-1 text-xs text-[var(--color-fog)]">
            {paper.year ?? "Year unknown"}
          </p>
        </div>
        <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-[var(--color-fog)]" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md bg-[var(--color-cream)] px-2 py-1">
          {formatNumber(paper.citations)} citations
        </span>
        {paper.seedAuthors.map((seedAuthor) => (
          <span
            key={seedAuthor.id}
            className="rounded-md bg-[var(--color-sand)] px-2 py-1"
          >
            {seedAuthor.name}
          </span>
        ))}
      </div>
    </a>
  );
}

function compareSharedAuthors(
  first: SharedOverlapAuthor,
  second: SharedOverlapAuthor,
  mode: AuthorSortMode,
) {
  switch (mode) {
    case "citations":
      return (
        second.totalCitations - first.totalCitations ||
        second.paperCount - first.paperCount
      );
    case "papers":
      return (
        second.paperCount - first.paperCount ||
        second.totalCitations - first.totalCitations
      );
    case "recent":
      return (
        latestAuthorPaperYear(second) - latestAuthorPaperYear(first) ||
        second.totalCitations - first.totalCitations
      );
    case "name":
      return first.name.localeCompare(second.name);
    case "overlaps":
    default:
      return (
        second.connectedSeedAuthors.length - first.connectedSeedAuthors.length ||
        second.paperCount - first.paperCount ||
        second.totalCitations - first.totalCitations
      );
  }
}

function compareProofPapers(
  first: ProofPaper,
  second: ProofPaper,
  mode: ProofPaperSortMode,
) {
  switch (mode) {
    case "year-desc":
      return (second.year ?? 0) - (first.year ?? 0) || second.citations - first.citations;
    case "year-asc":
      return (first.year ?? 9999) - (second.year ?? 9999) || second.citations - first.citations;
    case "seed-authors":
      return (
        second.seedAuthors.length - first.seedAuthors.length ||
        second.citations - first.citations
      );
    case "citations":
    default:
      return second.citations - first.citations || (second.year ?? 0) - (first.year ?? 0);
  }
}

function latestAuthorPaperYear(author: SharedOverlapAuthor) {
  return Math.max(0, ...author.papers.map((paper) => paper.year ?? 0));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
