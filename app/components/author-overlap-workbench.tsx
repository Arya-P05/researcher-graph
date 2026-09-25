"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type {
  AuthorOverlapResponse,
  OverlapPaper,
} from "@/lib/author-overlap-types";

type SortMode =
  | "degree"
  | "citations"
  | "year-desc"
  | "year-asc"
  | "shared-authors"
  | "seed-authors"
  | "author-count"
  | "title";

const defaultQuery = "https://doi.org/10.1038/nature14539";

export default function AuthorOverlapWorkbench() {
  const [query, setQuery] = useState(defaultQuery);
  const [result, setResult] = useState<AuthorOverlapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [seedAuthorFilter, setSeedAuthorFilter] = useState("all");
  const [sharedAuthorFilter, setSharedAuthorFilter] = useState("all");
  const [onlyPapersWithSharedAuthors, setOnlyPapersWithSharedAuthors] =
    useState(true);
  const [onlyPapersWithMultipleSeedAuthors, setOnlyPapersWithMultipleSeedAuthors] =
    useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("degree");

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/author-overlap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Overlap request failed.");
      }

      setResult(payload as AuthorOverlapResponse);
      setSearch("");
      setSeedAuthorFilter("all");
      setSharedAuthorFilter("all");
      setOnlyPapersWithSharedAuthors(true);
      setOnlyPapersWithMultipleSeedAuthors(false);
      setSortMode("degree");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredPapers = useMemo(() => {
    if (!result) {
      return [];
    }

    const normalizedSearch = search.trim().toLowerCase();

    return result.papers
      .filter((paper) =>
        onlyPapersWithSharedAuthors ? paper.sharedAuthorCount > 0 : true,
      )
      .filter((paper) =>
        onlyPapersWithMultipleSeedAuthors ? paper.seedAuthorCount > 1 : true,
      )
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
      .filter((paper) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          paper.title.toLowerCase().includes(normalizedSearch) ||
          [...paper.seedAuthors, ...paper.sharedAuthors].some((author) =>
            author.name.toLowerCase().includes(normalizedSearch),
          )
        );
      })
      .sort((first, second) => comparePapers(first, second, sortMode));
  }, [
    onlyPapersWithMultipleSeedAuthors,
    onlyPapersWithSharedAuthors,
    result,
    search,
    seedAuthorFilter,
    sharedAuthorFilter,
    sortMode,
  ]);

  return (
    <main className="min-h-screen bg-white text-[var(--color-jet-ink)]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-[var(--color-steel)] underline">
            Back to graph
          </Link>
          <h1 className="text-3xl font-semibold">Author overlap workbench</h1>
          <p className="max-w-[760px] text-sm leading-6 text-[var(--color-steel)]">
            Paste a paper. We find every author on it, fetch their complete
            OpenAlex paper histories, and show which coauthors overlap and which
            papers prove it.
          </p>
        </header>

        <form onSubmit={run} className="space-y-3 border border-black/20 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="block">
              <span className="text-sm font-medium">Research paper</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mt-1 w-full border border-black/30 px-3 py-2 text-sm"
                placeholder="DOI, title, or OpenAlex work URL"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="self-end border border-black bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isLoading ? "Finding..." : "Run"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {result ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Stat label="Seed authors" value={result.summary.seedAuthorsProcessed} />
              <Stat label="Papers fetched" value={result.summary.papersFetched} />
              <Stat label="Unique authors" value={result.summary.uniqueAuthors} />
              <Stat label="Shared authors" value={result.summary.sharedAuthors} />
            </section>

            {result.warnings.length > 0 ? (
              <section className="border border-yellow-500 bg-yellow-50 p-3 text-sm">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="border border-black/20 p-4">
              <h2 className="text-xl font-semibold">{result.summary.seedTitle}</h2>
              <p className="mt-1 text-sm text-[var(--color-steel)]">
                Found {result.summary.seedAuthorsProcessed} authors on the seed
                paper and scanned their complete OpenAlex paper histories.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.seedAuthors.map((author) => (
                  <button
                    key={author.id}
                    type="button"
                    onClick={() =>
                      setSeedAuthorFilter(
                        seedAuthorFilter === author.id ? "all" : author.id,
                      )
                    }
                    className={`border px-2 py-1 text-xs ${
                      seedAuthorFilter === author.id
                        ? "border-black bg-black text-white"
                        : "border-black/30"
                    }`}
                  >
                    {author.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="border border-black/20 p-4">
              <h2 className="text-xl font-semibold">Shared authors</h2>
              <p className="mt-1 text-sm text-[var(--color-steel)]">
                These are non-seed authors who appear with more than one seed
                author across the fetched papers.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/30 text-left">
                      <th className="py-2 pr-3">Author</th>
                      <th className="py-2 pr-3">Connects seed authors</th>
                      <th className="py-2 pr-3">Papers</th>
                      <th className="py-2 pr-3">Top proof papers</th>
                      <th className="py-2 pr-3">Filter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sharedAuthors.map((author) => (
                      <tr key={author.id} className="border-b border-black/10">
                        <td className="py-2 pr-3 align-top">
                          <a
                            href={author.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline"
                          >
                            {author.name}
                          </a>
                          <div className="text-xs text-[var(--color-steel)]">
                            {author.primaryInstitution ?? "Unknown institution"}
                          </div>
                        </td>
                        <td className="py-2 pr-3 align-top">
                          {author.connectedSeedAuthors
                            .map((seedAuthor) => seedAuthor.name)
                            .join(", ")}
                        </td>
                        <td className="py-2 pr-3 align-top">{author.paperCount}</td>
                        <td className="py-2 pr-3 align-top">
                          <ol className="list-decimal space-y-1 pl-4">
                            {author.papers.slice(0, 3).map((paper) => (
                              <li key={paper.id}>
                                <a
                                  href={paper.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  {paper.title}
                                </a>
                              </li>
                            ))}
                          </ol>
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setSharedAuthorFilter(
                                sharedAuthorFilter === author.id ? "all" : author.id,
                              )
                            }
                            className="border border-black px-2 py-1 text-xs"
                          >
                            {sharedAuthorFilter === author.id ? "Clear" : "Show papers"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border border-black/20 p-4">
              <h2 className="text-xl font-semibold">Papers</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                <label className="block">
                  <span className="text-sm font-medium">Search</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="mt-1 w-full border border-black/30 px-3 py-2 text-sm"
                    placeholder="Paper, seed author, or shared author"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Shared author</span>
                  <select
                    value={sharedAuthorFilter}
                    onChange={(event) => setSharedAuthorFilter(event.target.value)}
                    className="mt-1 w-full border border-black/30 px-3 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    {result.sharedAuthors.map((author) => (
                      <option key={author.id} value={author.id}>
                        {author.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Sort</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="mt-1 w-full border border-black/30 px-3 py-2 text-sm"
                  >
                    <option value="degree">Degree</option>
                    <option value="citations">Citations</option>
                    <option value="year-desc">Newest</option>
                    <option value="year-asc">Oldest</option>
                    <option value="shared-authors">Shared authors</option>
                    <option value="seed-authors">Seed authors</option>
                    <option value="author-count">Author count</option>
                    <option value="title">Title</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyPapersWithSharedAuthors}
                    onChange={(event) =>
                      setOnlyPapersWithSharedAuthors(event.target.checked)
                    }
                  />
                  Only papers with shared authors
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyPapersWithMultipleSeedAuthors}
                    onChange={(event) =>
                      setOnlyPapersWithMultipleSeedAuthors(event.target.checked)
                    }
                  />
                  Only papers with 2+ seed authors
                </label>
              </div>

              <p className="mt-3 text-sm text-[var(--color-steel)]">
                Showing {filteredPapers.length} of {result.papers.length} papers.
                Degree = seed authors on this paper + shared authors on this paper.
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/30 text-left">
                      <th className="py-2 pr-3">Paper</th>
                      <th className="py-2 pr-3">Year</th>
                      <th className="py-2 pr-3">Cites</th>
                      <th className="py-2 pr-3">Degree</th>
                      <th className="py-2 pr-3">Seed authors</th>
                      <th className="py-2 pr-3">Shared authors</th>
                      <th className="py-2 pr-3">Authors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPapers.map((paper) => (
                      <tr key={paper.id} className="border-b border-black/10">
                        <td className="max-w-[360px] py-2 pr-3 align-top">
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline"
                          >
                            {paper.title}
                          </a>
                          <div className="text-xs text-[var(--color-steel)]">
                            {paper.type ?? "work"}
                          </div>
                        </td>
                        <td className="py-2 pr-3 align-top">{paper.year ?? "—"}</td>
                        <td className="py-2 pr-3 align-top">
                          {formatNumber(paper.citations)}
                        </td>
                        <td className="py-2 pr-3 align-top">{paper.degree}</td>
                        <td className="py-2 pr-3 align-top">
                          {paper.seedAuthors.map((author) => author.name).join(", ")}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          {paper.sharedAuthors.length > 0
                            ? paper.sharedAuthors
                                .map((author) => author.name)
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          {paper.authorCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="border border-black/20 p-4 text-sm text-[var(--color-steel)]">
            Run the default paper to see the first overlap table.
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/20 p-3">
      <p className="text-xs uppercase text-[var(--color-steel)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{formatNumber(value)}</p>
    </div>
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
    case "shared-authors":
      return (
        second.sharedAuthorCount - first.sharedAuthorCount ||
        second.citations - first.citations
      );
    case "seed-authors":
      return (
        second.seedAuthorCount - first.seedAuthorCount ||
        second.citations - first.citations
      );
    case "author-count":
      return second.authorCount - first.authorCount || second.citations - first.citations;
    case "title":
      return first.title.localeCompare(second.title);
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
