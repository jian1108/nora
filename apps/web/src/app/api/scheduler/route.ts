import { NextResponse } from "next/server";
import {
  bookAppointmentAndConfirm,
  getAvailableSlotsForDate,
} from "@/lib/calendar";
import { verifySchedulerAndSendPendingConfirmations } from "@/lib/sms";
import { readDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  const availability = await getAvailableSlotsForDate(date);
  const db = readDb();

  return NextResponse.json({
    ...availability,
    appointments: db.appointments,
    smsLogs: db.smsLogs,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "verify_and_send_sms") {
    const report = await verifySchedulerAndSendPendingConfirmations();
    return NextResponse.json(report);
  }

  const {
    callerName,
    callerPhone,
    date,
    startTime,
    requirementSummary,
    sendSmsImmediately = true,
  } = body;

  if (!callerName || !callerPhone || !date || !startTime || !requirementSummary) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing required fields: callerName, callerPhone, date, startTime, requirementSummary",
      },
      { status: 400 }
    );
  }

  const result = await bookAppointmentAndConfirm({
    callerName,
    callerPhone,
    date,
    startTime,
    requirementSummary,
    sendSmsImmediately,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 409 });
}

