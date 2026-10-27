import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, b2FileExists, b2PublicUrl, getB2ConfigForFolder, uploadBufferToB2 } from "@/lib/b2";
import { createReelAdmin } from "@/lib/db";
import { getVideoDuration } from "@/lib/video";

export const maxDuration = 300;

const FOLDER_TYPES: FolderType[] = ["dramas", "reels", "payouts"];

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const folderType = ((formData.get("folderType") as string) || "dramas") as FolderType;
    const targetName = (formData.get("targetName") as string) || `item_${Date.now()}`;
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (!FOLDER_TYPES.includes(folderType)) {
      return NextResponse.json({ error: "Invalid folderType" }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided for upload" }, { status: 400 });
    }

    const b2Config = await getB2ConfigForFolder(folderType);
    if (!b2Config) {
      return NextResponse.json({ error: `Backblaze B2 is not configured for folder type: ${folderType}` }, { status: 400 });
    }

    const uploadedUrls: Record<string, string> = {};
    const sanitizedTarget = targetName.replace(/[^a-zA-Z0-9._-]/g, "_");
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const b2FileName =
        folderType === "reels"
          ? `${folderType}/${sanitizedFilename}`
          : `${folderType}/${sanitizedTarget}/${sanitizedFilename}`;

      // One cheap lookup per file instead of listing the entire bucket.
      const exists = await b2FileExists(folderType, b2FileName).catch(() => false);

      let finalUrl: string;
      let buffer: Buffer | null = null;
      if (exists) {
        finalUrl = await b2PublicUrl(folderType, b2FileName);
        skippedCount++;
      } else {
        buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadBufferToB2({
          folderType,
          b2FileName,
          buffer,
          mimeType: file.type || "application/octet-stream",
        });
        finalUrl = result.url;
        uploadedCount++;
      }

      uploadedUrls[file.name] = finalUrl;

      if (folderType === "reels" && finalUrl && buffer) {
        try {
          const durationSeconds = (await getVideoDuration(buffer)) || 0;
          await createReelAdmin({
            title: sanitizedFilename.replace(/\.[^.]+$/, "").replace(/_/g, " "),
            videoUrl: finalUrl,
            durationSeconds,
            synopsis: `Uploaded via folder upload (${folderType})`,
            isPublished: true,
          });
        } catch (dbErr) {
          console.warn(`Failed to create reel DB entry for ${file.name}:`, dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      b2Configured: true,
      message: `Uploaded ${uploadedCount} file(s) to Backblaze B2 (${folderType}); ${skippedCount} already existed.`,
    });
  } catch (err: unknown) {
    console.error("Folder upload failed:", err);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}
