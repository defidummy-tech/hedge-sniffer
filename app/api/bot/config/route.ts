// ═══ Bot Config API ═══
// GET: returns current config
// POST: updates config (partial update)

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: journal.getConfig(),
  });
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json();
    var updated = journal.updateConfig(body);

    journal.logAction("CONFIG", "Updated: " + Object.keys(body).join(", "));

    return NextResponse.json({
      ok: true,
      config: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
