import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getB2ConfigForFolder, getUrlSigner, saveBufferLocally, uploadBufferToB2 } from "@/lib/b2";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // The payouts page sends either multipart (file upload) or JSON ({ url }).
    const isJson = (req.headers.get("content-type") || "").includes("application/json");
    let file: File | null = null;
    let directUrl: string | null = null;

    if (isJson) {
      const body = await req.json().catch(() => ({}));
      directUrl = typeof body?.url === "string" ? body.url : null;
    } else {
      const formData = await req.formData();
      const f = formData.get("file");
      file = f instanceof File ? f : null;
      const u = formData.get("url");
      directUrl = typeof u === "string" ? u : null;
    }

    if (directUrl?.trim()) {
      return NextResponse.json({ success: true, url: directUrl.trim(), message: "Receipt URL registered" });
    }

    if (!file) {
      return NextResponse.json({ error: "File or URL is required" }, { status: 400 });
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: "Receipt image must be under 10 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (path.extname(file.name) || ".jpg").replace(/[^a-zA-Z0-9.]/g, "");
    const filename = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    if (await getB2ConfigForFolder("payouts")) {
      const result = await uploadBufferToB2({
        folderType: "payouts",
        b2FileName: `payouts/receipts/${filename}`,
        buffer,
        mimeType: file.type || "image/jpeg",
      });
      const sign = await getUrlSigner("payouts", [result.url]);
      return NextResponse.json({
        success: true,
        url: result.url,
        previewUrl: sign(result.url),
        message: "Receipt uploaded to Backblaze B2",
      });
    }

    // Local fallback for development only (doesn't work with multiple servers).
    const local = saveBufferLocally({ folderType: "payouts", targetName: "receipts", fileName: filename, buffer });
    return NextResponse.json({ success: true, url: local.url, message: "Receipt screenshot saved locally" });
  } catch (err: unknown) {
    console.error("Failed to upload receipt:", err);
    return NextResponse.json({ error: "Failed to upload receipt image" }, { status: 500 });
  }
}
