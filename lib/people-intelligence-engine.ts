import type { GraphNode, GraphResponse, RankedResearcher } from "@/lib/graph-types";
import { buildResearchGraph } from "@/lib/openalex";
import type {
  IntelligenceCoauthor,
  IntelligenceOverlap,
  IntelligencePerson,
  IntelligenceRequest,
  IntelligenceResult,
  IntelligenceSignal,
  IntelligenceWork,
} from "@/lib/people-intelligence";

type RosterEntry = {
  inputName: string;
  note: string | null;
  suppliedSourceUrl: string | null;
};

type OpenAlexAuthor = {
  id?: string;
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  orcid?: string | null;
  summary_stats?: {
    h_index?: number | null;
  } | null;
  last_known_institutions?: OpenAlexInstitution[];
};

type OpenAlexInstitution = {
  id?: string;
  display_name?: string;
  country_code?: string;
  type?: string;
};

type OpenAlexAuthorship = {
  author?: {
    id?: string;
    display_name?: string;
  };
  raw_author_name?: string;
  institutions?: OpenAlexInstitution[];
};

type OpenAlexWork = {
  id?: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  authorships?: OpenAlexAuthorship[];
};

const OPENALEX_BASE = "https://api.openalex.org";
const MAX_ROSTER_PEOPLE = 24;
const AUTHOR_SELECT = [
  "id",
  "display_name",
  "works_count",
  "cited_by_count",
  "last_known_institutions",
  "orcid",
  "summary_stats",
].join(",");
const WORK_SELECT = [
  "id",
  "title",
  "display_name",
  "publication_year",
  "cited_by_count",
  "authorships",
].join(",");

export async function buildPeopleIntelligence(
  request: IntelligenceRequest,
): Promise<IntelligenceResult> {
  const roster = parseRoster(request.rosterText).slice(0, MAX_ROSTER_PEOPLE);

  if (roster.length === 0) {
    throw new PeopleIntelligenceError(
      "Paste at least one public person name to compare.",
      400,
    );
  }

  const graph = await buildResearchGraph({
    query: request.seedQuery,
    depth: 3,
    breadth: 12,
    includeCitations: true,
    includeSameAuthor: true,
  });
  const people = await Promise.all(roster.map(enrichRosterEntry));
  const overlaps = scoreOverlaps(people, graph);
  const warnings = [
    ...graph.warnings,
    ...people.flatMap((person) => person.warnings),
  ];

  if (roster.length >= MAX_ROSTER_PEOPLE) {
    warnings.push(
      `Roster capped at ${MAX_ROSTER_PEOPLE} people for an interactive run.`,
    );
  }

  return {
    summary: {
      seedTitle: graph.summary.seedTitle,
      seedUrl: graph.summary.seedUrl,
      graphAuthors: graph.rankedResearchers.length,
      publicPeople: people.length,
      resolvedPeople: people.filter((person) => person.openAlexAuthorId).length,
      leads: overlaps.length,
      source: "OpenAlex",
    },
    people,
    overlaps,
    warnings,
  };
}

export function peopleIntelligenceErrorResponse(error: unknown) {
  const status = error instanceof PeopleIntelligenceError ? error.status : 500;
  const message =
    error instanceof Error
      ? error.message
      : "Could not build the people intelligence layer.";

  return Response.json({ error: message }, { status });
}

async function enrichRosterEntry(entry: RosterEntry): Promise<IntelligencePerson> {
  const warnings: string[] = [];
  const author = await resolveAuthor(entry.inputName);

  if (!author?.id) {
    return {
      id: `manual:${slug(entry.inputName)}`,
      inputName: entry.inputName,
      name: entry.inputName,
      note: entry.note,
      suppliedSourceUrl: entry.suppliedSourceUrl,
      openAlexAuthorId: null,
      openAlexUrl: null,
      matchConfidence: "unresolved",
      worksCount: 0,
      citations: 0,
      hIndex: null,
      institutions: [],
      topWorks: [],
      coauthors: [],
      warnings: [`No OpenAlex author match for ${entry.inputName}.`],
    };
  }

  const name = author.display_name ?? entry.inputName;
  const matchConfidence =
    normalizeName(name) === normalizeName(entry.inputName) ? "resolved" : "likely";
  const works = await fetchAuthorWorks(author.id);
  const coauthors = extractCoauthors(works, author.id);
  const institutions = uniqueStrings(
    author.last_known_institutions
      ?.map((institution) => institution.display_name)
      .filter((institution): institution is string => Boolean(institution)) ??
      [],
  ).slice(0, 3);

  if (matchConfidence === "likely") {
    warnings.push(`Matched ${entry.inputName} to OpenAlex author ${name}.`);
  }

  return {
    id: author.id,
    inputName: entry.inputName,
    name,
    note: entry.note,
    suppliedSourceUrl: entry.suppliedSourceUrl,
    openAlexAuthorId: author.id,
    openAlexUrl: author.id,
    matchConfidence,
    worksCount: author.works_count ?? 0,
    citations: author.cited_by_count ?? 0,
    hIndex: author.summary_stats?.h_index ?? null,
    institutions,
    topWorks: works.map(toIntelligenceWork),
    coauthors,
    warnings,
  };
}

function scoreOverlaps(
  people: IntelligencePerson[],
  graph: GraphResponse,
): IntelligenceOverlap[] {
  const workNodes = graph.nodes.filter((node) => node.kind === "work");
  const workIds = new Set(workNodes.map((node) => node.id));
  const workById = new Map(workNodes.map((node) => [node.id, node]));
  const overlaps: IntelligenceOverlap[] = [];

  for (const person of people) {
    for (const researcher of graph.rankedResearchers) {
      const signals = collectSignals(person, researcher, workIds, workById);

      if (signals.length === 0) {
        continue;
      }

      const score = Math.min(
        100,
        Math.round(signals.reduce((total, signal) => total + signal.weight, 0)),
      );

      overlaps.push({
        id: `${person.id}->${researcher.id}`,
        score,
        publicPersonId: person.id,
        publicPersonName: person.name,
        researcherId: researcher.id,
        researcherName: researcher.name,
        researcherInstitution: researcher.primaryInstitution,
        researcherUrl: researcher.url,
        signals,
      });
    }
  }

  return overlaps
    .sort((a, b) => b.score - a.score || b.signals.length - a.signals.length)
    .slice(0, 24);
}

function collectSignals(
  person: IntelligencePerson,
  researcher: RankedResearcher,
  graphWorkIds: Set<string>,
  graphWorkById: Map<string, GraphNode>,
): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];

  if (
    person.openAlexAuthorId &&
    shortOpenAlexId(person.openAlexAuthorId) === shortOpenAlexId(researcher.id)
  ) {
    signals.push({
      kind: "same-person",
      label: "Same OpenAlex author",
      weight: 100,
      confidence: "high",
      evidence: `${person.name} resolves to the same author ID as ${researcher.name}.`,
      sourceUrl: person.openAlexUrl,
    });
  } else if (normalizeName(person.name) === normalizeName(researcher.name)) {
    signals.push({
      kind: "same-person",
      label: "Same public name",
      weight: 85,
      confidence: "medium",
      evidence: `${person.inputName} and ${researcher.name} have the same normalized name.`,
      sourceUrl: person.openAlexUrl,
    });
  }

  const sharedWorks = person.topWorks.filter((work) =>
    graphWorkIds.has(work.id),
  );
  for (const work of sharedWorks.slice(0, 2)) {
    signals.push({
      kind: "same-paper",
      label: "Same paper",
      weight: 75,
      confidence: "high",
      evidence: `${person.name} appears on ${work.title}, which is in the current graph.`,
      sourceUrl: work.url,
    });
  }

  const directCoauthor = person.coauthors.find(
    (coauthor) => shortOpenAlexId(coauthor.id) === shortOpenAlexId(researcher.id),
  );
  if (directCoauthor) {
    const coauthoredWork = person.topWorks.find((work) => {
      const graphWork = graphWorkById.get(work.id);
      return graphWork?.label === work.title || graphWork?.id === work.id;
    });

    signals.push({
      kind: "direct-coauthor",
      label: "Direct coauthor path",
      weight: coauthoredWork ? 80 : 45,
      confidence: coauthoredWork ? "high" : "medium",
      evidence: coauthoredWork
        ? `${person.name} and ${researcher.name} are connected through ${coauthoredWork.title}.`
        : `${person.name} has ${researcher.name} in their OpenAlex coauthor set.`,
      sourceUrl: coauthoredWork?.url ?? person.openAlexUrl,
    });
  }

  const personInstitutions = new Set(person.institutions.map(normalizeName));
  const researcherInstitution = normalizeName(researcher.primaryInstitution);

  if (personInstitutions.has(researcherInstitution) && researcherInstitution) {
    signals.push({
      kind: "same-institution",
      label: "Same institution",
      weight: 20,
      confidence: "low",
      evidence: `${person.name} and ${researcher.name} both have ${researcher.primaryInstitution} in public metadata.`,
      sourceUrl: person.openAlexUrl,
    });
  }

  if (
    person.note &&
    researcher.primaryInstitution !== "Unknown" &&
    normalizeName(person.note).includes(researcherInstitution)
  ) {
    signals.push({
      kind: "manual-affiliation",
      label: "Manual affiliation note",
      weight: 15,
      confidence: "low",
      evidence: `${person.inputName} was supplied with a note matching ${researcher.primaryInstitution}.`,
      sourceUrl: person.suppliedSourceUrl,
    });
  }

  return signals;
}

async function resolveAuthor(nameOrId: string): Promise<OpenAlexAuthor | null> {
  const openAlexAuthorId = nameOrId.match(/(?:openalex\.org\/)?(A\d{4,})/i)?.[1];

  if (openAlexAuthorId) {
    return fetchOpenAlex<OpenAlexAuthor>(
      openAlexUrl(`/authors/${openAlexAuthorId}`, {
        select: AUTHOR_SELECT,
      }),
    );
  }

  const url = openAlexUrl("/authors", {
    search: nameOrId,
    per_page: "3",
    select: AUTHOR_SELECT,
  });
  const envelope = await fetchOpenAlex<{ results?: OpenAlexAuthor[] }>(url);
  const candidates = envelope.results ?? [];

  if (candidates.length === 0) {
    return null;
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: authorMatchScore(nameOrId, candidate),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.candidate.cited_by_count ?? 0) - (a.candidate.cited_by_count ?? 0),
    )[0]?.candidate ?? null;
}

async function fetchAuthorWorks(authorId: string): Promise<OpenAlexWork[]> {
  const url = openAlexUrl("/works", {
    filter: `author.id:${shortOpenAlexId(authorId)}`,
    sort: "cited_by_count:desc",
    per_page: "12",
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
      throw new PeopleIntelligenceError(
        `OpenAlex returned ${response.status}.`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof PeopleIntelligenceError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new PeopleIntelligenceError("OpenAlex took too long to respond.", 504);
    }

    throw new PeopleIntelligenceError("Could not reach OpenAlex.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function parseRoster(text: string): RosterEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", note = "", sourceUrl = ""] = line
        .split("|")
        .map((part) => part.trim());

      return {
        inputName: name,
        note: note || null,
        suppliedSourceUrl: sourceUrl || null,
      };
    })
    .filter((entry) => entry.inputName.length > 1);
}

function extractCoauthors(
  works: OpenAlexWork[],
  authorId: string,
): IntelligenceCoauthor[] {
  const coauthors = new Map<string, string>();

  for (const work of works) {
    for (const authorship of work.authorships ?? []) {
      const id = authorship.author?.id;
      const name = authorship.author?.display_name ?? authorship.raw_author_name;

      if (!id || !name || shortOpenAlexId(id) === shortOpenAlexId(authorId)) {
        continue;
      }

      coauthors.set(id, name);
    }
  }

  return [...coauthors.entries()]
    .map(([id, name]) => ({ id, name }))
    .slice(0, 80);
}

function toIntelligenceWork(work: OpenAlexWork): IntelligenceWork {
  const id = work.id ?? "";

  return {
    id,
    title: work.title ?? work.display_name ?? "Untitled work",
    year: work.publication_year ?? null,
    citations: work.cited_by_count ?? 0,
    url: id,
  };
}

function authorMatchScore(input: string, author: OpenAlexAuthor) {
  const inputName = normalizeName(input);
  const authorName = normalizeName(author.display_name ?? "");

  if (!authorName) {
    return 0;
  }

  if (inputName === authorName) {
    return 100;
  }

  const inputTokens = new Set(inputName.split(" ").filter(Boolean));
  const authorTokens = new Set(authorName.split(" ").filter(Boolean));
  const shared = [...inputTokens].filter((token) => authorTokens.has(token)).length;

  return Math.round((shared / Math.max(inputTokens.size, 1)) * 75);
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

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shortOpenAlexId(id: string) {
  return id.match(/[WAISCFPT]\d{4,}$/i)?.[0] ?? id;
}

function slug(value: string) {
  return normalizeName(value).replaceAll(" ", "-") || "unknown";
}

class PeopleIntelligenceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
