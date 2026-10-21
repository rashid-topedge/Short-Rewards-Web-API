import { NextRequest, NextResponse } from "next/server";
import { getReel, incrementReelViews, incrementReelLikes } from "@/lib/db";
import { getB2ConfigForFolder, buildPublicUrl, buildAuthorizedPublicUrl, getB2Client, resolveBucketName } from "@/lib/b2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  const reel = await getReel(id);
  if (!reel) {
    return NextResponse.json({ error: "Reel not found" }, { status: 404 });
  }

  // Resolve B2 public URL server-side if videoUrl points to B2
  let publicVideoUrl = reel.videoUrl;
  try {
    const b2Config = await getB2ConfigForFolder("reels");
    if (b2Config && reel.videoUrl) {
      const { client, downloadUrl } = await getB2Client(b2Config.keyId, b2Config.applicationKey);
      const bucketName = await resolveBucketName(client, b2Config.bucketId);
      const fileNameMatch = reel.videoUrl.match(/\/file\/[^/]+\/(.+)/);
      if (fileNameMatch) {
        const b2FileName = fileNameMatch[1];
        publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, b2FileName, downloadUrl, bucketName || undefined);
      } else if (reel.videoUrl.startsWith("http")) {
        publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, reel.videoUrl.replace(/.*\/file\/[^/]+\//, ""), downloadUrl, bucketName || undefined);
      }
    }
  } catch {
    // fall back to DB videoUrl
  }

  await incrementReelViews(id);

  return NextResponse.json({ ...reel, videoUrl: publicVideoUrl });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;
  const id = parseInt(reelId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reel ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "like") {
      await incrementReelLikes(id);
      const reel = await getReel(id);
      let publicVideoUrl = reel?.videoUrl || "";
      try {
        const b2Config = await getB2ConfigForFolder("reels");
        if (b2Config && reel?.videoUrl) {
          const { client, downloadUrl } = await getB2Client(b2Config.keyId, b2Config.applicationKey);
          const bucketName = await resolveBucketName(client, b2Config.bucketId);
          const fileNameMatch = reel?.videoUrl?.match(/\/file\/[^/]+\/(.+)/);
          if (fileNameMatch) {
            publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, fileNameMatch[1], downloadUrl, bucketName || undefined);
          } else if (reel?.videoUrl?.startsWith("http")) {
            const f = reel.videoUrl.replace(/.*\/file\/[^/]+\//, "");
            publicVideoUrl = await buildAuthorizedPublicUrl(b2Config, f, downloadUrl, bucketName || undefined);
          }
        }
      } catch {
        // ignore
      }
      return NextResponse.json({ success: true, message: "Reel liked", reel: reel ? { ...reel, videoUrl: publicVideoUrl } : null });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to process reel action" }, { status: 500 });
  }
}
