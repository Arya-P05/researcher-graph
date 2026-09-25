export type OverlapAuthor = {
  id: string;
  name: string;
  url: string;
  primaryInstitution: string | null;
};

export type OverlapPaper = {
  id: string;
  title: string;
  url: string;
  doi: string | null;
  year: number | null;
  type: string | null;
  citations: number;
  authorCount: number;
  seedAuthorCount: number;
  sharedAuthorCount: number;
  degree: number;
  seedAuthors: OverlapAuthor[];
  sharedAuthors: OverlapAuthor[];
};

export type SharedOverlapAuthor = OverlapAuthor & {
  connectedSeedAuthors: OverlapAuthor[];
  paperCount: number;
  totalCitations: number;
  papers: Array<{
    id: string;
    title: string;
    url: string;
    year: number | null;
    citations: number;
    seedAuthors: OverlapAuthor[];
  }>;
};

export type AuthorOverlapRequest = {
  query: string;
};

export type AuthorOverlapResponse = {
  summary: {
    seedTitle: string;
    seedUrl: string;
    seedDoi: string | null;
    source: string;
    elapsedMs: number;
    seedAuthorsProcessed: number;
    seedAuthorsAvailable: number;
    papersFetched: number;
    uniqueAuthors: number;
    sharedAuthors: number;
    papersWithSharedAuthors: number;
    papersWithMultipleSeedAuthors: number;
  };
  seedAuthors: OverlapAuthor[];
  sharedAuthors: SharedOverlapAuthor[];
  papers: OverlapPaper[];
  warnings: string[];
};
