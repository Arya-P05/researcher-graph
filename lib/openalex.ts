import {
  GraphEdge,
  GraphNode,
  GraphRequest,
  GraphResponse,
  RankedResearcher,
} from "@/lib/graph-types";

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
  referenced_works?: string[];
  related_works?: string[];
};

type WorkAuthor = {
  id: string;
  name: string;
  institution?: string;
};

type WorkCandidate = {
  id: string;
  relation: "same-author" | "cites-seed" | "related" | "reference";
  fromWorkId: string;
  label: string;
};

type ExpansionOptions = {
  depth: number;
  breadth: number;
  includeCitations: boolean;
  includeSameAuthor: boolean;
};

const OPENALEX_BASE = "https://api.openalex.org";
const WORK_SELECT = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "cited_by_count",
  "type",
  "authorships",
  "referenced_works",
  "related_works",
].join(",");

class GraphBuildError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function buildResearchGraph(
  request: GraphRequest,
): Promise<GraphResponse> {
  const startedAt = Date.now();
  const options: ExpansionOptions = {
    depth: clamp(Math.round(request.depth ?? 2), 1, 2),
    breadth: clamp(Math.round(request.breadth ?? 10), 4, 18),
    includeCitations: request.includeCitations ?? true,
    includeSameAuthor: request.includeSameAuthor ?? true,
  };

  const seed = await resolveSeedWork(request.query);
  const warnings: string[] = [];
  const works = new Map<string, OpenAlexWork>();
  const workDepth = new Map<string, number>();
  const relationEdges: GraphEdge[] = [];

  works.set(seed.id, seed);
  workDepth.set(seed.id, 0);

  let frontier = [seed];

  for (let layer = 0; layer < options.depth; layer += 1) {
    const candidates = await collectLayerCandidates(frontier, seed, options, layer);
    const unseen = dedupeCandidates(candidates)
      .filter((candidate) => !works.has(candidate.id))
      .sort(
        (a, b) => candidatePriority(b.relation) - candidatePriority(a.relation),
      );
    const selected = unseen.slice(0, options.breadth);

    if (selected.length === 0) {
      break;
    }

    const fetched = await fetchWorksByIds(selected.map((candidate) => candidate.id));
    const fetchedIds = new Set(fetched.map((work) => work.id));

    for (const candidate of selected) {
      if (!fetchedIds.has(candidate.id)) {
        continue;
      }

      relationEdges.push({
        id: `rel:${candidate.fromWorkId}->${candidate.id}:${candidate.relation}`,
        source: candidate.fromWorkId,
        target: candidate.id,
        kind: candidate.relation,
        label: candidate.label,
        strength: relationStrength(candidate.relation),
      });
    }

    frontier = fetched;

    for (const work of fetched) {
      works.set(work.id, work);
      workDepth.set(work.id, layer + 1);
    }
  }

  if (works.size === 1) {
    warnings.push(
      "OpenAlex returned the seed paper, but not enough connected papers for a useful expansion. Try a DOI for a more-cited paper or increase breadth.",
    );
  }

  const graph = makeGraph(seed, [...works.values()], workDepth, relationEdges);
  const elapsedMs = Date.now() - startedAt;

  return {
    summary: {
      seedTitle: workTitle(seed),
      seedUrl: seed.id,
      seedDoi: seed.doi ?? null,
      works: graph.nodes.filter((node) => node.kind === "work").length,
      authors: graph.nodes.filter((node) => node.kind === "author").length,
      edges: graph.edges.length,
      depth: options.depth,
      elapsedMs,
      source: "OpenAlex",
    },
    nodes: graph.nodes,
    edges: graph.edges,
    rankedResearchers: graph.rankedResearchers,
    warnings,
  };
}

export function graphErrorResponse(error: unknown) {
  const status = error instanceof GraphBuildError ? error.status : 500;
  const message =
    error instanceof Error
      ? error.message
      : "Could not build the researcher graph.";

  return Response.json({ error: message }, { status });
}

async function resolveSeedWork(query: string): Promise<OpenAlexWork> {
  const cleaned = query.trim();

  if (cleaned.length < 4) {
    throw new GraphBuildError("Paste a DOI, OpenAlex work URL, or paper title.");
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
      if (!(error instanceof GraphBuildError) || error.status !== 404) {
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
  const envelope = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(url);
  const seed = envelope.results?.[0];

  if (!seed) {
    throw new GraphBuildError(
      "No OpenAlex work matched that input. Try a DOI for the paper.",
      404,
    );
  }

  return seed;
}

async function collectLayerCandidates(
  frontier: OpenAlexWork[],
  seed: OpenAlexWork,
  options: ExpansionOptions,
  layer: number,
): Promise<WorkCandidate[]> {
  const candidates: WorkCandidate[] = [];

  for (const work of frontier) {
    const relatedLimit = layer === 0 ? 6 : 3;
    const referenceLimit = layer === 0 ? 4 : 2;

    for (const id of (work.related_works ?? []).slice(0, relatedLimit)) {
      candidates.push({
        id,
        relation: "related",
        fromWorkId: work.id,
        label: "related",
      });
    }

    for (const id of (work.referenced_works ?? []).slice(0, referenceLimit)) {
      candidates.push({
        id,
        relation: "reference",
        fromWorkId: work.id,
        label: "reference",
      });
    }
  }

  if (options.includeCitations) {
    const citationTargets = layer === 0 ? frontier : frontier.slice(0, 3);
    const citationResults = await Promise.allSettled(
      citationTargets.map((work) => fetchCitingWorks(work, layer === 0 ? 3 : 1)),
    );

    for (const result of citationResults) {
      if (result.status === "fulfilled") {
        candidates.push(...result.value);
      }
    }
  }

  if (options.includeSameAuthor && layer === 0) {
    const seedAuthors = getWorkAuthors(seed).slice(0, 6);
    const sameAuthorResults = await Promise.allSettled(
      seedAuthors.map((author) => fetchAuthorWorks(author.id, seed.id)),
    );

    for (const result of sameAuthorResults) {
      if (result.status === "fulfilled") {
        candidates.push(...result.value);
      }
    }
  }

  return candidates.filter((candidate) => candidate.id !== seed.id);
}

async function fetchCitingWorks(
  work: OpenAlexWork,
  limit: number,
): Promise<WorkCandidate[]> {
  const workId = shortOpenAlexId(work.id);
  const url = openAlexUrl("/works", {
    filter: `cites:${workId}`,
    sort: "cited_by_count:desc",
    per_page: String(limit),
    select: WORK_SELECT,
  });
  const envelope = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(url);

  return (envelope.results ?? []).map((citingWork) => ({
    id: citingWork.id,
    relation: "cites-seed",
    fromWorkId: work.id,
    label: "cites",
  }));
}

async function fetchAuthorWorks(
  authorId: string,
  seedWorkId: string,
): Promise<WorkCandidate[]> {
  const url = openAlexUrl("/works", {
    filter: `author.id:${shortOpenAlexId(authorId)}`,
    sort: "cited_by_count:desc",
    per_page: "3",
    select: "id",
  });
  const envelope = await fetchOpenAlex<{ results?: Pick<OpenAlexWork, "id">[] }>(
    url,
  );

  return (envelope.results ?? [])
    .filter((work) => work.id !== seedWorkId)
    .map((work) => ({
      id: work.id,
      relation: "same-author",
      fromWorkId: seedWorkId,
      label: "same author",
    }));
}

async function fetchSingleWork(id: string): Promise<OpenAlexWork> {
  const url = openAlexUrl(`/works/${encodeURIComponent(id)}`, {
    select: WORK_SELECT,
  });

  return fetchOpenAlex<OpenAlexWork>(url);
}

async function fetchWorksByIds(ids: string[]): Promise<OpenAlexWork[]> {
  const uniqueIds = [...new Set(ids.map(shortOpenAlexId).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return [];
  }

  const url = openAlexUrl("/works", {
    filter: `openalex:${uniqueIds.slice(0, 100).join("|")}`,
    per_page: String(Math.min(uniqueIds.length, 100)),
    select: WORK_SELECT,
  });
  const envelope = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(url);

  return envelope.results ?? [];
}

async function fetchOpenAlex<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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
      throw new GraphBuildError(
        openAlexErrorMessage(response.status, body),
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof GraphBuildError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new GraphBuildError(
        "OpenAlex took too long to respond. Try lowering breadth or using a DOI.",
        504,
      );
    }

    throw new GraphBuildError(
      "Could not reach OpenAlex. Check your network and try again.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function makeGraph(
  seed: OpenAlexWork,
  works: OpenAlexWork[],
  workDepth: Map<string, number>,
  relationEdges: GraphEdge[],
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rankedResearchers: RankedResearcher[];
} {
  const authorStats = new Map<
    string,
    {
      name: string;
      url: string;
      workIds: Set<string>;
      seedWorkIds: Set<string>;
      citations: number;
      coauthors: Set<string>;
      institutions: Map<string, number>;
      proximity: number;
      evidence: string[];
    }
  >();
  const edges = new Map<string, GraphEdge>();

  for (const edge of relationEdges) {
    edges.set(edge.id, edge);
  }

  for (const work of works) {
    const authors = getWorkAuthors(work);
    const depth = workDepth.get(work.id) ?? 2;

    for (const author of authors) {
      const stat =
        authorStats.get(author.id) ??
        {
          name: author.name,
          url: author.id,
          workIds: new Set<string>(),
          seedWorkIds: new Set<string>(),
          citations: 0,
          coauthors: new Set<string>(),
          institutions: new Map<string, number>(),
          proximity: 99,
          evidence: [],
        };

      stat.workIds.add(work.id);
      stat.citations += work.cited_by_count ?? 0;
      stat.proximity = Math.min(stat.proximity, depth);

      if (work.id === seed.id) {
        stat.seedWorkIds.add(work.id);
      }

      if (author.institution) {
        stat.institutions.set(
          author.institution,
          (stat.institutions.get(author.institution) ?? 0) + 1,
        );
      }

      for (const coauthor of authors) {
        if (coauthor.id !== author.id) {
          stat.coauthors.add(coauthor.id);
        }
      }

      const evidenceLine = `${workTitle(work)}${
        work.publication_year ? ` (${work.publication_year})` : ""
      }`;
      if (!stat.evidence.includes(evidenceLine) && stat.evidence.length < 5) {
        stat.evidence.push(evidenceLine);
      }

      authorStats.set(author.id, stat);

      const edgeId = `authored:${author.id}->${work.id}`;
      edges.set(edgeId, {
        id: edgeId,
        source: author.id,
        target: work.id,
        kind: work.id === seed.id ? "seed" : "authored",
        label: work.id === seed.id ? "seed author" : "author",
        strength: work.id === seed.id ? 3 : 1.4,
      });
    }
  }

  const rankedResearchers = [...authorStats.entries()]
    .map(([id, stat]) => {
      const paperCount = stat.workIds.size;
      const seedPapers = stat.seedWorkIds.size;
      const coauthorCount = stat.coauthors.size;
      const citationScore = Math.log10(stat.citations + 10);
      const proximityBonus =
        stat.proximity === 0 ? 10 : stat.proximity === 1 ? 5 : 1;
      const bridgeBonus = paperCount > 1 ? (paperCount - 1) * 8 : 0;
      const score = Math.round(
        bridgeBonus +
          seedPapers * 15 +
          coauthorCount * 0.6 +
          citationScore * 5 +
          proximityBonus,
      );

      return {
        id,
        name: stat.name,
        url: stat.url,
        score,
        paperCount,
        seedPapers,
        coauthorCount,
        citations: stat.citations,
        primaryInstitution: mostFrequent(stat.institutions) || "Unknown",
        proximity: stat.proximity,
        evidence: stat.evidence,
      } satisfies RankedResearcher;
    })
    .sort((a, b) => b.score - a.score || b.paperCount - a.paperCount)
    .slice(0, 12);

  const rankedAuthorIds = new Set(
    rankedResearchers.map((researcher) => researcher.id),
  );
  const authorNodes: GraphNode[] = [...authorStats.entries()]
    .filter(([id, stat]) => rankedAuthorIds.has(id) || stat.seedWorkIds.size > 0)
    .map(([id, stat]) => {
      const ranking = rankedResearchers.find((researcher) => researcher.id === id);

      return {
        id,
        kind: "author",
        label: stat.name,
        subtitle: mostFrequent(stat.institutions) || "Researcher",
        url: stat.url,
        depth: stat.proximity,
        score: ranking?.score,
        citations: stat.citations,
        worksCount: stat.workIds.size,
        primaryInstitution: mostFrequent(stat.institutions) || undefined,
      };
    });
  const authorNodeIds = new Set(authorNodes.map((node) => node.id));

  const workNodes: GraphNode[] = works.map((work) => ({
    id: work.id,
    kind: "work",
    label: workTitle(work),
    subtitle: [
      work.publication_year,
      work.type?.replaceAll("-", " "),
      `${compactNumber(work.cited_by_count ?? 0)} cites`,
    ]
      .filter(Boolean)
      .join(" · "),
    url: work.id,
    depth: workDepth.get(work.id) ?? 2,
    citations: work.cited_by_count ?? 0,
    isSeed: work.id === seed.id,
  }));

  const workNodeIds = new Set(workNodes.map((node) => node.id));
  const filteredEdges = [...edges.values()].filter(
    (edge) =>
      (authorNodeIds.has(edge.source) || workNodeIds.has(edge.source)) &&
      (authorNodeIds.has(edge.target) || workNodeIds.has(edge.target)),
  );

  return {
    nodes: [...workNodes, ...authorNodes],
    edges: filteredEdges,
    rankedResearchers,
  };
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

function dedupeCandidates(candidates: WorkCandidate[]) {
  const seen = new Set<string>();
  const unique: WorkCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    unique.push(candidate);
  }

  return unique;
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

function relationStrength(relation: WorkCandidate["relation"]) {
  switch (relation) {
    case "same-author":
      return 2.5;
    case "cites-seed":
      return 2;
    case "related":
      return 1.6;
    case "reference":
      return 1.2;
  }
}

function candidatePriority(relation: WorkCandidate["relation"]) {
  switch (relation) {
    case "same-author":
      return 4;
    case "cites-seed":
      return 3;
    case "related":
      return 2;
    case "reference":
      return 1;
  }
}

function mostFrequent(values: Map<string, number>) {
  let winner = "";
  let max = 0;

  for (const [value, count] of values.entries()) {
    if (count > max) {
      winner = value;
      max = count;
    }
  }

  return winner;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function openAlexErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || `OpenAlex returned ${status}.`;
  } catch {
    return `OpenAlex returned ${status}.`;
  }
}
