import {
  AuthorOverlapRequest,
  AuthorOverlapResponse,
  OverlapAuthor,
  OverlapPaper,
  SharedOverlapAuthor,
} from "@/lib/author-overlap-types";

type OpenAlexAuthor = {
  id?: string;
  display_name?: string;
  orcid?: string | null;
};

type OpenAlexInstitution = {
  id?: string;
  display_name?: string;
  country_code?: string;
  type?: string;
};

type OpenAlexAuthorship = {
  author_position?: string;
  raw_author_name?: string;
  author?: OpenAlexAuthor;
  institutions?: OpenAlexInstitution[];
};

type OpenAlexWork = {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  type?: string | null;
  authorships?: OpenAlexAuthorship[];
};

type OpenAlexEnvelope<T> = {
  results?: T[];
  meta?: {
    next_cursor?: string | null;
  };
};

type WorkAuthor = {
  id: string;
  name: string;
  institution?: string;
};

type SharedAuthorStat = {
  author: OverlapAuthor;
  connectedSeedAuthorIds: Set<string>;
  paperIds: Set<string>;
  totalCitations: number;
};

const OPENALEX_BASE = "https://api.openalex.org";
const OPENALEX_PAGE_SIZE = 100;
const AUTHOR_FETCH_CONCURRENCY = 4;
const WORK_SELECT = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "cited_by_count",
  "type",
  "authorships",
].join(",");

class AuthorOverlapError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function buildAuthorOverlap(
  request: AuthorOverlapRequest,
): Promise<AuthorOverlapResponse> {
  const startedAt = Date.now();
  const seed = await resolveSeedWork(request.query);
  const seedAuthors = getWorkAuthors(seed);
  const seedAuthorIds = new Set(seedAuthors.map((author) => author.id));
  const seedAuthorById = new Map(
    seedAuthors.map((author) => [author.id, toOverlapAuthor(author)]),
  );
  const warnings: string[] = [];

  const results = await mapWithConcurrency(
    seedAuthors,
    AUTHOR_FETCH_CONCURRENCY,
    (author) => fetchWorksForAuthor(author.id),
  );
  const worksById = new Map<string, OpenAlexWork>();

  worksById.set(seed.id, seed);

  for (const [index, result] of results.entries()) {
    const author = seedAuthors[index];

    if (result.status === "rejected") {
      warnings.push(`Could not fetch papers for ${author.name}.`);
      continue;
    }

    for (const work of result.value) {
      worksById.set(work.id, work);
    }
  }

  const uniqueAuthorIds = new Set<string>();
  const sharedStats = new Map<string, SharedAuthorStat>();
  const paperSeedAuthors = new Map<string, OverlapAuthor[]>();
  const paperAuthors = new Map<string, OverlapAuthor[]>();

  for (const work of worksById.values()) {
    const authors = getWorkAuthors(work);
    const seedAuthorsOnPaper = authors
      .filter((author) => seedAuthorIds.has(author.id))
      .map((author) => seedAuthorById.get(author.id) ?? toOverlapAuthor(author));
    const overlapAuthors = authors.map((author) => toOverlapAuthor(author));

    paperSeedAuthors.set(work.id, seedAuthorsOnPaper);
    paperAuthors.set(work.id, overlapAuthors);

    for (const author of authors) {
      uniqueAuthorIds.add(author.id);

      if (seedAuthorIds.has(author.id)) {
        continue;
      }

      const stat =
        sharedStats.get(author.id) ??
        ({
          author: toOverlapAuthor(author),
          connectedSeedAuthorIds: new Set<string>(),
          paperIds: new Set<string>(),
          totalCitations: 0,
        } satisfies SharedAuthorStat);

      for (const seedAuthor of seedAuthorsOnPaper) {
        stat.connectedSeedAuthorIds.add(seedAuthor.id);
      }

      if (seedAuthorsOnPaper.length > 0) {
        stat.paperIds.add(work.id);
        stat.totalCitations += work.cited_by_count ?? 0;
      }

      sharedStats.set(author.id, stat);
    }
  }

  const sharedEntries = [...sharedStats.entries()]
    .filter(([, stat]) => stat.connectedSeedAuthorIds.size > 1)
    .sort(
      ([, first], [, second]) =>
        second.connectedSeedAuthorIds.size - first.connectedSeedAuthorIds.size ||
        second.paperIds.size - first.paperIds.size ||
        second.totalCitations - first.totalCitations,
    );
  const sharedAuthorIds = new Set(sharedEntries.map(([id]) => id));

  const papers = [...worksById.values()]
    .map((work) =>
      makeOverlapPaper(
        work,
        paperAuthors.get(work.id) ?? [],
        paperSeedAuthors.get(work.id) ?? [],
        sharedAuthorIds,
      ),
    )
    .filter((paper) => paper.seedAuthorCount > 0)
    .sort(
      (first, second) =>
        second.degree - first.degree ||
        second.citations - first.citations ||
        (second.year ?? 0) - (first.year ?? 0),
    );
  const papersById = new Map(papers.map((paper) => [paper.id, paper]));
  const sharedAuthors: SharedOverlapAuthor[] = sharedEntries.map(([, stat]) => {
    const proofPapers = [...stat.paperIds]
      .map((paperId) => papersById.get(paperId))
      .filter((paper): paper is OverlapPaper => Boolean(paper))
      .map((paper) => ({
        id: paper.id,
        title: paper.title,
        url: paper.url,
        year: paper.year,
        citations: paper.citations,
        seedAuthors: paper.seedAuthors,
      }))
      .sort(
        (first, second) =>
          second.seedAuthors.length - first.seedAuthors.length ||
          second.citations - first.citations ||
          (second.year ?? 0) - (first.year ?? 0),
      );

    return {
      ...stat.author,
      connectedSeedAuthors: [...stat.connectedSeedAuthorIds]
        .map((id) => seedAuthorById.get(id))
        .filter((author): author is OverlapAuthor => Boolean(author))
        .sort((first, second) => first.name.localeCompare(second.name)),
      paperCount: proofPapers.length,
      totalCitations: stat.totalCitations,
      papers: proofPapers,
    };
  });

  return {
    summary: {
      seedTitle: workTitle(seed),
      seedUrl: seed.id,
      seedDoi: seed.doi ?? null,
      source: "OpenAlex",
      elapsedMs: Date.now() - startedAt,
      seedAuthorsProcessed: seedAuthors.length,
      seedAuthorsAvailable: seedAuthors.length,
      papersFetched: papers.length,
      uniqueAuthors: uniqueAuthorIds.size,
      sharedAuthors: sharedAuthors.length,
      papersWithSharedAuthors: papers.filter((paper) => paper.sharedAuthorCount > 0)
        .length,
      papersWithMultipleSeedAuthors: papers.filter(
        (paper) => paper.seedAuthorCount > 1,
      ).length,
    },
    seedAuthors: seedAuthors.map((author) => toOverlapAuthor(author)),
    sharedAuthors,
    papers,
    warnings,
  };
}

export function authorOverlapErrorResponse(error: unknown) {
  const status = error instanceof AuthorOverlapError ? error.status : 500;
  const message =
    error instanceof Error
      ? error.message
      : "Could not build the author overlap table.";

  return Response.json({ error: message }, { status });
}

async function resolveSeedWork(query: string): Promise<OpenAlexWork> {
  const cleaned = query.trim();

  if (cleaned.length < 4) {
    throw new AuthorOverlapError("Paste a DOI, OpenAlex work URL, or paper title.");
  }

  const openAlexId = cleaned.match(/(?:openalex\.org\/)?(W\d{6,})/i)?.[1];
  if (openAlexId) {
    return fetchSingleWork(`W${openAlexId.replace(/^W/i, "")}`);
  }

  const doi = extractDoi(cleaned);
  if (doi) {
    try {
      return await fetchSingleWork(`https://doi.org/${doi}`);
    } catch (error) {
      if (!(error instanceof AuthorOverlapError) || error.status !== 404) {
        throw error;
      }
    }
  }

  const url = openAlexUrl("/works", {
    search: cleaned,
    sort: "relevance_score:desc",
    per_page: "1",
    select: WORK_SELECT,
  });
  const envelope = await fetchOpenAlex<OpenAlexEnvelope<OpenAlexWork>>(url);
  const seed = envelope.results?.[0];

  if (!seed) {
    throw new AuthorOverlapError(
      "No OpenAlex work matched that input. Try a DOI for the paper.",
      404,
    );
  }

  return seed;
}

async function fetchWorksForAuthor(authorId: string) {
  const works: OpenAlexWork[] = [];
  let cursor: string | null = "*";

  while (cursor) {
    const url = openAlexUrl("/works", {
      filter: `author.id:${shortOpenAlexId(authorId)}`,
      sort: "cited_by_count:desc",
      per_page: String(OPENALEX_PAGE_SIZE),
      cursor,
      select: WORK_SELECT,
    });
    const envelope = await fetchOpenAlex<OpenAlexEnvelope<OpenAlexWork>>(url);

    works.push(...(envelope.results ?? []));
    cursor = envelope.meta?.next_cursor ?? null;

    if ((envelope.results ?? []).length === 0) {
      break;
    }
  }

  return works;
}

async function fetchSingleWork(id: string): Promise<OpenAlexWork> {
  const url = openAlexUrl(`/works/${encodeURIComponent(id)}`, {
    select: WORK_SELECT,
  });

  return fetchOpenAlex<OpenAlexWork>(url);
}

async function fetchOpenAlex<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "researcher-graph-next/0.1",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AuthorOverlapError(
        openAlexErrorMessage(response.status, body),
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthorOverlapError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AuthorOverlapError(
        "OpenAlex took too long to respond. Try the paper again in a moment.",
        504,
      );
    }

    throw new AuthorOverlapError(
      "Could not reach OpenAlex. Check your network and try again.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function makeOverlapPaper(
  work: OpenAlexWork,
  authors: OverlapAuthor[],
  seedAuthors: OverlapAuthor[],
  sharedAuthorIds: Set<string>,
): OverlapPaper {
  const sharedAuthors = authors.filter((author) => sharedAuthorIds.has(author.id));

  return {
    id: work.id,
    title: workTitle(work),
    url: work.id,
    doi: work.doi ?? null,
    year: work.publication_year ?? null,
    type: work.type ?? null,
    citations: work.cited_by_count ?? 0,
    authorCount: authors.length,
    seedAuthorCount: seedAuthors.length,
    sharedAuthorCount: sharedAuthors.length,
    degree: seedAuthors.length + sharedAuthors.length,
    seedAuthors,
    sharedAuthors,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          status: "fulfilled",
          value: await mapper(items[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function getWorkAuthors(work: OpenAlexWork): WorkAuthor[] {
  const authors: WorkAuthor[] = [];

  for (const authorship of work.authorships ?? []) {
    const id = authorship.author?.id;
    const name =
      authorship.author?.display_name ?? authorship.raw_author_name ?? "Unknown";

    if (!id || !name) {
      continue;
    }

    const institution = authorship.institutions?.[0]?.display_name;
    authors.push(
      institution
        ? {
            id,
            name,
            institution,
          }
        : {
            id,
            name,
          },
    );
  }

  return authors;
}

function toOverlapAuthor(author: WorkAuthor): OverlapAuthor {
  return {
    id: author.id,
    name: author.name,
    url: author.id,
    primaryInstitution: author.institution ?? null,
  };
}

function openAlexUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${OPENALEX_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  if (process.env.OPENALEX_MAILTO) {
    url.searchParams.set("mailto", process.env.OPENALEX_MAILTO);
  }

  return url;
}

function extractDoi(input: string) {
  const match = input.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);

  return match?.[0].replace(/[)\].,;]+$/, "");
}

function shortOpenAlexId(id: string) {
  return id.match(/[WAISCFPT]\d{4,}$/i)?.[0] ?? id;
}

function workTitle(work: OpenAlexWork) {
  return work.title || work.display_name || "Untitled work";
}

function openAlexErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || `OpenAlex returned ${status}.`;
  } catch {
    return `OpenAlex returned ${status}.`;
  }
}
