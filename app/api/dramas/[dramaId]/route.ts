import { getDrama } from "@/lib/db";

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
    return Response.json(drama);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database query failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
