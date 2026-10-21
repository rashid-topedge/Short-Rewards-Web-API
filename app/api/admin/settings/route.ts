import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedAdmin } from "@/lib/auth";
import { getSystemSettings, updateSystemSettings } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSystemSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthenticatedAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updated = await updateSystemSettings({
      coinToPkrRate: body.coinToPkrRate !== undefined ? Number(body.coinToPkrRate) : undefined,
      minRedeemCoins: body.minRedeemCoins !== undefined ? Number(body.minRedeemCoins) : undefined,
      s3Endpoint: body.s3Endpoint,
      s3Bucket: body.s3Bucket,
      s3AccessKey: body.s3AccessKey,
      s3SecretKey: body.s3SecretKey,
      s3PublicUrl: body.s3PublicUrl,
      b2DramasKeyId: body.b2DramasKeyId,
      b2DramasAppKey: body.b2DramasAppKey,
      b2DramasBucketId: body.b2DramasBucketId,
      b2DramasPublicUrl: body.b2DramasPublicUrl,
      b2ReelsKeyId: body.b2ReelsKeyId,
      b2ReelsAppKey: body.b2ReelsAppKey,
      b2ReelsBucketId: body.b2ReelsBucketId,
      b2ReelsPublicUrl: body.b2ReelsPublicUrl,
      b2PayoutsKeyId: body.b2PayoutsKeyId,
      b2PayoutsAppKey: body.b2PayoutsAppKey,
      b2PayoutsBucketId: body.b2PayoutsBucketId,
      b2PayoutsPublicUrl: body.b2PayoutsPublicUrl,
    });

    return NextResponse.json({
      success: true,
      message: "System settings updated successfully",
      settings: updated,
    });
  } catch (err: unknown) {
    console.error("Failed to update settings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
