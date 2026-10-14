import { listDramas } from "@/lib/db";

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
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database query failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
