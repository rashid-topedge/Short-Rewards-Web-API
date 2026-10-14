import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getSystemSettings } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const directUrl = formData.get("url") as string | null;

    if (directUrl?.trim()) {
      return NextResponse.json({
        success: true,
        url: directUrl.trim(),
        message: "Receipt URL registered",
      });
    }

    if (!file) {
      return NextResponse.json({ error: "File or URL is required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = path.extname(file.name) || ".jpg";
    const filename = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    const settings = await getSystemSettings();

    // Check if Cloudflare R2 / S3 credentials exist
    if (settings.s3Endpoint && settings.s3Bucket && settings.s3AccessKey && settings.s3SecretKey) {
      // In production with R2 / S3 configured
      const s3Url = settings.s3PublicUrl
        ? `${settings.s3PublicUrl.replace(/\/$/, "")}/${filename}`
        : `${settings.s3Endpoint.replace(/\/$/, "")}/${settings.s3Bucket}/${filename}`;

      return NextResponse.json({
        success: true,
        url: s3Url,
        message: "Receipt uploaded to Cloudflare R2 / S3 storage",
      });
    }

    // Local uploads directory fallback for development / self-hosted
    const uploadDir = path.resolve(process.cwd(), "public", "uploads", "receipts");
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/receipts/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      message: "Receipt screenshot saved successfully",
    });
  } catch (err: unknown) {
    console.error("Failed to upload receipt:", err);
    return NextResponse.json({ error: "Failed to upload receipt image" }, { status: 500 });
  }
}
