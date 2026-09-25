import { GraphRequest } from "@/lib/graph-types";
import { buildResearchGraph, graphErrorResponse } from "@/lib/openalex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GraphRequest;
    const graph = await buildResearchGraph(body);

    return Response.json(graph);
  } catch (error) {
    return graphErrorResponse(error);
  }
}
