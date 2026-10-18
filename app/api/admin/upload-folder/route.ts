import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getSystemSettings } from "@/lib/db";
import B2 from "backblaze-b2";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const folderType = (formData.get("folderType") as string) || "dramas"; // dramas | reels | payouts
    const targetName = (formData.get("targetName") as string) || `item_${Date.now()}`;
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided for upload" }, { status: 400 });
    }

    const settings = await getSystemSettings();

    // Multi-account resolution: support per-folder account keys or fall back to global/env
    // e.g. B2 accounts mapping: dramas, reels, payouts
    let keyId = settings.s3AccessKey || process.env.B2_KEY_ID;
    let applicationKey = settings.s3SecretKey || process.env.B2_APPLICATION_KEY;
    let bucketId = settings.s3Bucket || process.env.B2_BUCKET_ID;
    let endpoint = settings.s3Endpoint || process.env.B2_ENDPOINT || "s3.us-west-004.backblazeb2.com";
    let publicUrlBase = settings.s3PublicUrl || "";

    if (folderType === "dramas") {
      keyId = settings[`b2_dramas_key_id`] || keyId;
      applicationKey = settings[`b2_dramas_app_key`] || applicationKey;
      bucketId = settings[`b2_dramas_bucket_id`] || bucketId;
      publicUrlBase = settings[`b2_dramas_public_url`] || publicUrlBase;
    } else if (folderType === "reels") {
      keyId = settings[`b2_reels_key_id`] || keyId;
      applicationKey = settings[`b2_reels_app_key`] || applicationKey;
      bucketId = settings[`b2_reels_bucket_id`] || bucketId;
      publicUrlBase = settings[`b2_reels_public_url`] || publicUrlBase;
    } else if (folderType === "payouts") {
      keyId = settings[`b2_payouts_key_id`] || keyId;
      applicationKey = settings[`b2_payouts_app_key`] || applicationKey;
      bucketId = settings[`b2_payouts_bucket_id`] || bucketId;
      publicUrlBase = settings[`b2_payouts_public_url`] || publicUrlBase;
    }

    const uploadedUrls: Record<string, string> = {};

    if (keyId && applicationKey && bucketId) {
      try {
        const b2 = new B2({
          applicationKeyId: keyId,
          applicationKey: applicationKey,
        });

        await b2.authorize();

        const uploadUrlResponse = await b2.getUploadUrl({
          bucketId: bucketId,
        });

        const { uploadUrl, authorizationToken } = uploadUrlResponse.data;

        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const b2FileName = `${folderType}/${targetName}/${sanitizedFilename}`;

          await b2.uploadFile({
            uploadUrl,
            uploadAuthToken: authorizationToken,
            fileName: b2FileName,
            data: buffer,
            mime: file.type || "application/octet-stream",
          });

          const publicUrl = publicUrlBase
            ? `${publicUrlBase.replace(/\/$/, "")}/${b2FileName}`
            : `https://${endpoint}/file/${bucketId}/${b2FileName}`;

          uploadedUrls[file.name] = publicUrl;
        }

        return NextResponse.json({
          success: true,
          urls: uploadedUrls,
          message: `Successfully uploaded ${files.length} files to B2 account (${folderType})`,
        });
      } catch (b2Err: unknown) {
        console.error(`B2 multi-account error for ${folderType}, falling back to local:`, b2Err);
      }
    }

    // Fallback: Local storage in public/uploads/
    const fs = await import("fs");
    const path = await import("path");
    const uploadDir = path.resolve(process.cwd(), "public", "uploads", folderType, targetName);
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(uploadDir, sanitizedFilename);
      fs.writeFileSync(filePath, buffer);
      uploadedUrls[file.name] = `/uploads/${folderType}/${targetName}/${sanitizedFilename}`;
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      message: `Successfully saved ${files.length} files locally under folder: ${folderType}/${targetName}`,
    });
  } catch (err: unknown) {
    console.error("Multi-account folder upload failed:", err);
    return NextResponse.json({ error: "Failed to process folder upload" }, { status: 500 });
  }
}
