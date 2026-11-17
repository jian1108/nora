import { NextResponse } from "next/server";
import { checkIsOfficeOpenNow, readDb, writeDb } from "@/lib/db";

export async function GET() {
  const db = readDb();
  const status = checkIsOfficeOpenNow(db.settings);
  return NextResponse.json({
    settings: db.settings,
    status,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const db = readDb();

  if (typeof body.forceAfterHoursMode === "boolean") {
    db.settings.forceAfterHoursMode = body.forceAfterHoursMode;
  }
  if (typeof body.officeName === "string") {
    db.settings.officeName = body.officeName;
  }
  if (typeof body.afterHoursGreeting === "string") {
    db.settings.afterHoursGreeting = body.afterHoursGreeting;
  }
  if (Array.isArray(body.schedule)) {
    db.settings.schedule = body.schedule;
  }

  writeDb(db);
  return NextResponse.json({
    settings: db.settings,
    status: checkIsOfficeOpenNow(db.settings),
  });
}

