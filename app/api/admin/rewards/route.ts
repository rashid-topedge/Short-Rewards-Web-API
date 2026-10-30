import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getRewardConfig, logActivity, saveRewardConfig } from "@/lib/db";
import { DEFAULT_REWARD_CONFIG, parseRewardConfig, type RewardConfig } from "@/lib/rewardConfig";
import { actorOf } from "@/lib/reelPermissions";

/** GET /api/admin/rewards: current reward config + defaults (admins and moderators). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ config: await getRewardConfig(), defaults: DEFAULT_REWARD_CONFIG });
}

/** Lists what changed, e.g. ["ad.coins: 25 → 30", "reel.tiers: …"]. */
function describeChanges(before: RewardConfig, after: RewardConfig): string[] {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (Array.isArray(a) || Array.isArray(b) || typeof a !== "object" || typeof b !== "object" || !a || !b) {
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      return;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    }
  };
  walk(before, after, "");
  return out;
}

/**
 * PUT /api/admin/rewards { config }: replaces the reward config (admins and
 * moderators). Live on every server within 30 s; logged with who changed what.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const body = await req.json().catch(() => ({}));
  const before = await getRewardConfig();
  const parsed = parseRewardConfig(body?.config, before);
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join(". "), errors: parsed.errors }, { status: 400 });

  const changes = describeChanges(before, parsed.config);
  if (!changes.length) return NextResponse.json({ success: true, changed: false, config: before });

  const saved = await saveRewardConfig(parsed.config);
  await logActivity(actorOf(session), {
    action: "rewards.updated",
    entityType: "settings",
    entityId: "rewards",
    summary: `Changed rewards: ${changes.slice(0, 6).join("; ")}${changes.length > 6 ? ` (+${changes.length - 6} more)` : ""}`,
    details: { changes },
  });
  return NextResponse.json({ success: true, changed: true, config: saved });
}
