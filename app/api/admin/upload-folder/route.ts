import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { FolderType, getB2ConfigForFolder, uploadBufferToB2, saveBufferLocally, listB2FileNames, buildPublicUrl } from "@/lib/b2";
import { createReelAdmin } from "@/lib/db";
import { execFile } from "child_process";
import { promisify } from "util";
import { getVideoDuration } from "@/lib/video";
import fs from "fs";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const folderType = ((formData.get("folderType") as string) || "dramas") as FolderType;
    const targetName = (formData.get("targetName") as string) || `item_${Date.now()}`;
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided for upload" }, { status: 400 });
    }

    const b2Config = await getB2ConfigForFolder(folderType);
    if (!b2Config) {
      return NextResponse.json({ error: `Backblaze B2 is not configured for folder type: ${folderType}` }, { status: 400 });
    }

    const uploadedUrls: Record<string, string> = {};
    const sanitizedTarget = targetName.replace(/[^a-zA-Z0-9._-]/g, "_");
    let existingB2Names = new Set<string>();
    try {
      existingB2Names = await listB2FileNames(folderType);
    } catch {
      // Ignore listing failure; proceed with uploads.
    }

    let b2SuccessCount = 0;

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const isFlat = folderType === "reels";
      const b2FileName = isFlat
        ? `${folderType}/${sanitizedFilename}`
        : `${folderType}/${sanitizedTarget}/${sanitizedFilename}`;

      let finalUrl = "";

      if (existingB2Names.has(b2FileName)) {
        finalUrl = buildPublicUrl(b2Config, b2FileName);
        b2SuccessCount++;
      } else {
        const result = await uploadBufferToB2({
          folderType,
          b2FileName,
          buffer,
          mimeType: file.type || "application/octet-stream",
        });
        finalUrl = result.url;
        b2SuccessCount++;
      }

      uploadedUrls[file.name] = finalUrl;

      if (folderType === "reels" && finalUrl) {
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

    const message = `Successfully processed ${b2SuccessCount} file(s) to Backblaze B2 (${folderType}).`;

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      b2Configured: true,
      message,
    });
  } catch (err: unknown) {
    console.error("Folder upload failed:", err);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}
