# Researcher Map PRD

## Summary

Researcher Map turns a seed paper into an explainable graph of researchers, papers, and collaboration signals. The product helps a candidate quickly identify which researchers are most relevant to a target conversation, why they matter, and what evidence to mention.

This is designed for the Ishan conversation: show the ability to bring people together, think in systems, and prototype a product that makes relationship discovery faster.

## Problem

When preparing for a high-leverage research or recruiting conversation, the hard part is not finding papers. The hard part is understanding the people graph:

- Who authored the seed paper?
- Which adjacent papers matter?
- Which people recur across multiple papers?
- Which people bridge labs, companies, or topics?
- What evidence can be used in conversation without sounding vague?

Manual prep is slow, shallow, and biased toward famous names. A small graph system can make the search more rigorous and visible.

## Goals

- Given a paper title, DOI, arXiv DOI, or OpenAlex work ID, resolve the seed paper.
- Extract authors and institutional affiliations.
- Expand to a bounded set of adjacent papers using citation, related-work, reference, and same-author signals.
- Build a people-and-papers graph.
- Rank researchers using explainable evidence.
- Render a polished, interactive Next.js demo that can be shown live.

## Non-Goals

- Do not scrape private profiles or gated data.
- Do not claim employment history unless sourced.
- Do not infer personal relationships beyond shared public research artifacts.
- Do not attempt full web-scale crawling in the MVP.
- Do not build the xAI employee overlap feature in V1; treat it as a later enrichment path.

## Primary User

A founder/candidate preparing for a conversation with a technical leader or research org. The user needs fast context and credible talking points, not a comprehensive bibliometrics platform.

## Core Flow

1. User enters a seed paper title or DOI.
2. System resolves the paper through OpenAlex.
3. System fetches authors, citations, references, related papers, and same-author papers.
4. System constructs a bounded two-hop graph.
5. System ranks researchers by repeated appearances, proximity to the seed, coauthor breadth, and citation weight.
6. User clicks nodes or ranked people to inspect evidence.

## MVP Data Source

Use OpenAlex because it provides a free API over works, authors, institutions, topics, and citation neighborhoods. It supports DOI lookup, title search, batch work fetches, author-work filters, cited-by filters, and related work IDs.

Relevant API behavior verified on September 25, 2026:

- Single work by DOI: `/works/https%3A%2F%2Fdoi.org%2F...`
- Title search: `/works?search=...&sort=relevance_score:desc`
- Batch works: `/works?filter=openalex:W...|W...`
- Citing works: `/works?filter=cites:W...&sort=cited_by_count:desc`
- Author works: `/works?filter=author.id:A...&sort=cited_by_count:desc`

## Ranking Model

Each researcher gets a transparent score:

- Seed authorship bonus: direct author on the entered paper.
- Bridge bonus: appears on multiple papers in the expanded graph.
- Proximity bonus: closer to the seed paper is better.
- Coauthor span: more unique coauthors means stronger connective tissue.
- Citation weight: log-scaled citations across matched works.

The score is intentionally simple. It should be easy to explain in an interview and easy to replace with a stronger centrality model later.

## System Design

### Architecture

- Next.js App Router frontend.
- Client component for controls, graph rendering, and selection state.
- Route handler at `/api/graph` for all scholarly API access.
- Server-side OpenAlex module for seed resolution, expansion, dedupe, scoring, and graph shaping.

### Request Path

```text
Browser
  -> POST /api/graph
    -> resolve seed paper
    -> fetch candidate works
    -> batch hydrate works
    -> extract authorships
    -> score researchers
    -> return nodes, edges, rankings, warnings
  -> render graph and ranked evidence
```

### Expansion Strategy

The expansion is deliberately bounded:

- Max depth: 2
- Breadth: 4 to 18 works per layer
- Seed-author expansion: top cited works for first six seed authors
- Citation expansion: top cited works that cite the frontier papers
- Semantic/reference expansion: `related_works` and `referenced_works`

This keeps latency and API usage sane while still creating a useful graph.

### Data Model

- `GraphNode`: author or work, with label, subtitle, URL, depth, and metrics.
- `GraphEdge`: authored, seed, same-author, cites, related, or reference relation.
- `RankedResearcher`: score, evidence papers, citations, coauthor count, institution, proximity.

## V1 UX

The first screen is the working surface:

- Left: seed paper and expansion controls.
- Center: graph canvas.
- Right: metrics, ranked researchers, and evidence panel.

The demo should feel like a serious internal research tool: dense, clean, and fast to scan.

## Future V2

- Add Semantic Scholar as a fallback source and compare confidence.
- Cache graph runs in Postgres or SQLite.
- Add ORCID disambiguation.
- Add institution and company timeline enrichment.
- Add a target-org overlap mode where the user uploads or selects an org roster.
- Add exports: briefing memo, intro map, CSV, and JSON.
- Add background jobs for deeper expansion beyond two hops.

## xAI / Target Org Enrichment

The screenshot suggested using employee background history as an optional talking point, not a V1 task. The right implementation is:

1. Build a target org roster from public sources.
2. Resolve identities carefully with source citations.
3. Normalize schools, employers, dates, papers, and coauthors.
4. Join target-org people against the researcher graph.
5. Surface overlaps only with evidence and confidence.

This should be opt-in because it introduces identity resolution risk and source-quality concerns.

## Success Criteria

- A seed DOI or title returns a graph in under 15 seconds for normal breadth.
- The graph includes at least the seed paper, seed authors, and connected papers.
- Ranked researchers include evidence papers and source URLs.
- The demo can be run locally with `npm run dev`.
- The system design is credible enough to discuss scaling, source quality, and future enrichment.
