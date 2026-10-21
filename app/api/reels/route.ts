import { NextRequest, NextResponse } from "next/server";
import { listReels } from "@/lib/db";
import { getB2ConfigForFolder, buildAuthorizedPublicUrl, getB2Client, resolveBucketName } from "@/lib/b2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const dramaIdParam = searchParams.get("dramaId");
  const dramaId = dramaIdParam ? parseInt(dramaIdParam, 10) : undefined;
  const sort = (searchParams.get("sort") || "newest") as "newest" | "trending" | "random";

  const data = await listReels({
    cursor: isNaN(cursor as number) ? undefined : cursor,
    limit,
    dramaId: isNaN(dramaId as number) ? undefined : dramaId,
    sort,
  });

  try {
    const b2Config = await getB2ConfigForFolder("reels");
    if (b2Config) {
      const { client, downloadUrl } = await getB2Client(b2Config.keyId, b2Config.applicationKey);
      const bucketName = await resolveBucketName(client, b2Config.bucketId);

      const items = await Promise.all(
        data.items.map(async (reel) => {
          if (!reel.videoUrl) return reel;
          let publicVideoUrl = reel.videoUrl;
          try {
            const fileNameMatch = reel.videoUrl.match(/\/file\/[^/]+\/(.+)/);
            if (fileNameMatch) {
              publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, fileNameMatch[1], downloadUrl, bucketName || undefined);
            } else if (reel.videoUrl.startsWith("http")) {
              const f = reel.videoUrl.replace(/.*\/file\/[^/]+\//, "");
              publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, f, downloadUrl, bucketName || undefined);
            }
          } catch {
            // keep original
          }
          return { ...reel, videoUrl: publicVideoUrl };
        })
      );

      return NextResponse.json({ ...data, items });
    }
  } catch {
    // ignore B2 auth/resolution failure, return original data
  }

  return NextResponse.json(data);
}
