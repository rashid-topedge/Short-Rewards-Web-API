import { listDramas } from "@/lib/db";
import { signDramaCovers } from "@/lib/dramaMedia";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "24");
  const query = url.searchParams.get("q") ?? "";
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? Number(cursorParam) : undefined;

  try {
    const result = await listDramas({
      limit: Number.isFinite(limit) ? limit : 24,
      query,
      cursor: isNaN(cursor as number) ? undefined : cursor,
    });
    // Same for every viewer; signed links last at least a day, so a short CDN cache is safe.
    return Response.json({ ...result, items: await signDramaCovers(result.items) }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Failed to list dramas:", error);
    return Response.json({ error: "Failed to load dramas" }, { status: 500 });
  }
}
