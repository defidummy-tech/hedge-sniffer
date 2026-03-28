// ═══ Tweet Config API ═══
// GET: returns current tweet alert config
// POST: updates tweet config (partial update)

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";

export var dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: await journal.getTweetConfig(),
  });
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json();
    var updated = await journal.updateTweetConfig(body);
    journal.logAction("TWEET_CONFIG", "Updated: " + Object.keys(body).join(", "));
    return NextResponse.json({
      ok: true,
      config: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
