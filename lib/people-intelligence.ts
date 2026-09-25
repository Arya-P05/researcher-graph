export type IntelligenceStage = {
  title: string;
  status: "Ready" | "Needs source" | "Planned";
  description: string;
  output: string;
};

export type IntelligenceRecord = {
  name: string;
  purpose: string;
  fields: string[];
};

export type OverlapSignal = {
  label: string;
  weight: string;
  confidence: "High" | "Medium" | "Low";
  description: string;
};

export type SourceClass = {
  label: string;
  priority: string;
  examples: string[];
};

export type SampleConnection = {
  xaiSide: string;
  researcherSide: string;
  relationship: string;
  confidence: string;
  evidence: string[];
  nextAction: string;
};

export type IntelligenceRequest = {
  seedQuery: string;
  rosterText: string;
};

export type IntelligencePerson = {
  id: string;
  inputName: string;
  name: string;
  note: string | null;
  suppliedSourceUrl: string | null;
  openAlexAuthorId: string | null;
  openAlexUrl: string | null;
  matchConfidence: "resolved" | "likely" | "unresolved";
  worksCount: number;
  citations: number;
  hIndex: number | null;
  institutions: string[];
  topWorks: IntelligenceWork[];
  coauthors: IntelligenceCoauthor[];
  warnings: string[];
};

export type IntelligenceWork = {
  id: string;
  title: string;
  year: number | null;
  citations: number;
  url: string;
};

export type IntelligenceCoauthor = {
  id: string;
  name: string;
};

export type IntelligenceSignal = {
  kind:
    | "same-person"
    | "same-paper"
    | "direct-coauthor"
    | "same-institution"
    | "manual-affiliation";
  label: string;
  weight: number;
  confidence: "high" | "medium" | "low";
  evidence: string;
  sourceUrl: string | null;
};

export type IntelligenceOverlap = {
  id: string;
  score: number;
  publicPersonId: string;
  publicPersonName: string;
  researcherId: string;
  researcherName: string;
  researcherInstitution: string;
  researcherUrl: string;
  signals: IntelligenceSignal[];
};

export type IntelligenceResult = {
  summary: {
    seedTitle: string;
    seedUrl: string;
    graphAuthors: number;
    publicPeople: number;
    resolvedPeople: number;
    leads: number;
    source: string;
  };
  people: IntelligencePerson[];
  overlaps: IntelligenceOverlap[];
  warnings: string[];
};

export const DEFAULT_INTELLIGENCE_SEED =
  "https://doi.org/10.1038/nature14539";

export const DEFAULT_PUBLIC_ROSTER = [
  "Yann LeCun | phase-one author demo",
  "Geoffrey E. Hinton | phase-one author demo",
  "Ilya Sutskever | public AI researcher demo",
  "Jimmy Ba | public AI researcher demo",
  "Christian Szegedy | public AI researcher demo",
].join("\n");

export const intelligenceStages: IntelligenceStage[] = [
  {
    title: "Discover public xAI people",
    status: "Needs source",
    description:
      "Build a roster only from public pages, profiles, papers, and announcements.",
    output: "Candidate people with source URLs and confidence",
  },
  {
    title: "Enrich backgrounds",
    status: "Ready",
    description:
      "Pull education, labs, employers, papers, coauthors, advisors, and date ranges.",
    output: "Source-backed public timelines",
  },
  {
    title: "Normalize identities",
    status: "Ready",
    description:
      "Merge aliases, OpenAlex IDs, scholar profiles, GitHub handles, and profile pages.",
    output: "One canonical person record per human",
  },
  {
    title: "Score overlaps",
    status: "Ready",
    description:
      "Compare xAI public timelines against researchers surfaced by the seed-paper graph.",
    output: "Explainable connection leads",
  },
];

export const intelligenceRecords: IntelligenceRecord[] = [
  {
    name: "Person",
    purpose: "Canonical human identity across public sources.",
    fields: [
      "aliases",
      "current role",
      "organization",
      "OpenAlex author",
      "profile URLs",
      "confidence",
    ],
  },
  {
    name: "Affiliation",
    purpose: "Company, lab, or university relationship with dates.",
    fields: [
      "organization",
      "role",
      "start date",
      "end date",
      "location",
      "source",
    ],
  },
  {
    name: "Publication",
    purpose: "Paper-level evidence tied back to phase-one graph nodes.",
    fields: [
      "title",
      "year",
      "OpenAlex work",
      "authors",
      "venue",
      "citation count",
    ],
  },
  {
    name: "Overlap",
    purpose: "A scored bridge between an xAI person and a researcher.",
    fields: [
      "signal type",
      "score contribution",
      "date overlap",
      "supporting sources",
      "confidence",
    ],
  },
];

export const overlapSignals: OverlapSignal[] = [
  {
    label: "Same public person",
    weight: "+100",
    confidence: "High",
    description:
      "The xAI profile and graph researcher resolve to the same canonical identity.",
  },
  {
    label: "Direct coauthor",
    weight: "+80",
    confidence: "High",
    description:
      "Both people appear as authors on the same paper from OpenAlex or another paper source.",
  },
  {
    label: "Same paper",
    weight: "+75",
    confidence: "High",
    description:
      "The xAI person is a coauthor on one of the phase-one seed or connected papers.",
  },
  {
    label: "Company overlap",
    weight: "+60",
    confidence: "Medium",
    description:
      "Both timelines include the same employer or lab with overlapping date ranges.",
  },
  {
    label: "School or lab overlap",
    weight: "+45",
    confidence: "Medium",
    description:
      "Education or lab history overlaps by institution and time window.",
  },
  {
    label: "Shared coauthor",
    weight: "+25",
    confidence: "Medium",
    description:
      "They do not share a paper directly, but both connect to the same collaborator.",
  },
  {
    label: "Same institution, unknown dates",
    weight: "+20",
    confidence: "Low",
    description:
      "A weaker lead when the institution matches but public dates are missing.",
  },
  {
    label: "Topic or venue similarity",
    weight: "+10",
    confidence: "Low",
    description:
      "A discovery hint from shared topics, labs, venues, or recurring conference context.",
  },
];

export const sourceClasses: SourceClass[] = [
  {
    label: "Primary public source",
    priority: "Use first",
    examples: ["Company bio", "personal website", "university profile"],
  },
  {
    label: "Publication source",
    priority: "Use for papers",
    examples: ["OpenAlex", "Semantic Scholar", "Google Scholar profile"],
  },
  {
    label: "Social or code profile",
    priority: "Use as support",
    examples: ["GitHub bio", "X profile", "conference speaker bio"],
  },
  {
    label: "Search result clue",
    priority: "Never final alone",
    examples: ["Exa result snippet", "news mention", "cached profile copy"],
  },
];

export const sampleConnections: SampleConnection[] = [
  {
    xaiSide: "Public xAI candidate",
    researcherSide: "Phase 1 researcher",
    relationship: "Potential company overlap",
    confidence: "Needs date verification",
    evidence: [
      "Both timelines mention the same lab or employer.",
      "At least one source has an explicit date range.",
      "No claim is shown as confirmed until the second source validates timing.",
    ],
    nextAction: "Verify public dates, then create an overlap edge.",
  },
  {
    xaiSide: "Public xAI candidate",
    researcherSide: "OpenAlex author",
    relationship: "Shared coauthor path",
    confidence: "Research lead",
    evidence: [
      "The phase-one graph already knows the shared paper neighborhood.",
      "The intelligence layer adds xAI roster identities to the same author graph.",
      "The UI can show the bridge as person -> coauthor -> researcher.",
    ],
    nextAction: "Resolve aliases before merging people records.",
  },
  {
    xaiSide: "Public xAI candidate",
    researcherSide: "Seed-paper author",
    relationship: "Same paper or same person",
    confidence: "High when sourced",
    evidence: [
      "OpenAlex author ID or paper author list provides the strongest proof.",
      "Profile pages can confirm the current organization separately.",
      "This becomes the strongest hiring or relationship lead in the map.",
    ],
    nextAction: "Keep paper source and profile source attached to the edge.",
  },
];

export const implementationBacklog = [
  "Create an offline enrichment job that writes a cached JSON roster.",
  "Add source objects for every person fact instead of storing raw text claims.",
  "Map phase-one graph researchers to OpenAlex author IDs before overlap scoring.",
  "Store date ranges as normalized intervals with unknown-start and unknown-end support.",
  "Add filters for same paper, coauthor, company, school, and low-confidence leads.",
  "Expose overlap edges in the existing graph when a person or paper is selected.",
];
