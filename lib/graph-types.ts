export type GraphNodeKind = "work" | "author";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  subtitle: string;
  url: string;
  depth: number;
  score?: number;
  citations?: number;
  worksCount?: number;
  primaryInstitution?: string;
  isSeed?: boolean;
};

export type GraphEdgeKind =
  | "authored"
  | "seed"
  | "same-author"
  | "cites-seed"
  | "related"
  | "reference";

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label: string;
  strength: number;
};

export type RankedResearcher = {
  id: string;
  name: string;
  url: string;
  score: number;
  paperCount: number;
  seedPapers: number;
  coauthorCount: number;
  citations: number;
  primaryInstitution: string;
  proximity: number;
  evidence: string[];
};

export type PaperInsightAuthor = {
  id: string;
  name: string;
  url: string;
  primaryInstitution?: string;
  paperCount: number;
};

export type PaperInsightWork = {
  id: string;
  label: string;
  url: string;
  year: number | null;
  type: string | null;
  citations: number;
  depth: number;
  authorCount: number;
  rankedAuthorCount: number;
  overlapAuthorCount: number;
  authors: PaperInsightAuthor[];
  overlapAuthors: PaperInsightAuthor[];
};

export type AuthorOverlapPaper = {
  id: string;
  label: string;
  url: string;
  year: number | null;
  citations: number;
  depth: number;
};

export type AuthorOverlap = {
  id: string;
  name: string;
  url: string;
  primaryInstitution: string;
  paperCount: number;
  totalCitations: number;
  proximity: number;
  papers: AuthorOverlapPaper[];
};

export type GraphSummary = {
  seedTitle: string;
  seedUrl: string;
  seedDoi: string | null;
  works: number;
  authors: number;
  edges: number;
  depth: number;
  elapsedMs: number;
  source: string;
};

export type GraphResponse = {
  summary: GraphSummary;
  nodes: GraphNode[];
  edges: GraphEdge[];
  rankedResearchers: RankedResearcher[];
  workInsights: PaperInsightWork[];
  authorOverlaps: AuthorOverlap[];
  warnings: string[];
};

export type GraphRequest = {
  query: string;
  depth?: number;
  breadth?: number;
  includeCitations?: boolean;
  includeSameAuthor?: boolean;
};
