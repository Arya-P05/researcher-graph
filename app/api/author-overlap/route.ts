import { AuthorOverlapRequest } from "@/lib/author-overlap-types";
import {
  authorOverlapErrorResponse,
  buildAuthorOverlap,
} from "@/lib/author-overlap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuthorOverlapRequest;
    const overlap = await buildAuthorOverlap(body);

    return Response.json(overlap);
  } catch (error) {
    return authorOverlapErrorResponse(error);
  }
}
