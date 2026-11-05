import { getDrama } from "@/lib/db";
import { signDramaDetail } from "@/lib/dramaMedia";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ dramaId: string }> },
) {
  const { dramaId } = await context.params;
  const id = Number(dramaId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid drama id" }, { status: 400 });
  }

  try {
    const drama = await getDrama(id);
    if (!drama) return Response.json({ error: "Drama not found" }, { status: 404 });
    // Same for every viewer; signed links last at least a day, so a short CDN cache is safe.
    return Response.json(await signDramaDetail(drama), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Failed to load drama:", error);
    return Response.json({ error: "Failed to load drama" }, { status: 500 });
  }
}
