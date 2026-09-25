import type { IntelligenceRequest } from "@/lib/people-intelligence";
import {
  buildPeopleIntelligence,
  peopleIntelligenceErrorResponse,
} from "@/lib/people-intelligence-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntelligenceRequest;
    const result = await buildPeopleIntelligence(body);

    return Response.json(result);
  } catch (error) {
    return peopleIntelligenceErrorResponse(error);
  }
}
