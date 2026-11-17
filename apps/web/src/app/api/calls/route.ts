import { NextResponse } from "next/server";
import { CallSummaryRecord, checkIsOfficeOpenNow, readDb, UrgencyLevel, writeDb } from "@/lib/db";
import { bookAppointmentAndConfirm } from "@/lib/calendar";

export async function GET() {
  const db = readDb();
  return NextResponse.json({
    calls: db.calls,
    appointments: db.appointments,
    smsLogs: db.smsLogs,
    settings: db.settings,
    officeStatus: checkIsOfficeOpenNow(db.settings),
  });
}

/**
 * Saves an after-hours call summary + message requirement, and optionally auto-books
 * the appointment on the calendar + triggers SMS confirmation in a single atomic workflow.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const db = readDb();
  const officeStatus = checkIsOfficeOpenNow(db.settings);

  const callerName = body.callerName || "Unknown Caller";
  const callerPhone = body.callerPhone || "+15550000000";
  const requirementSummary = body.requirementSummary || "General inquiry";
  const messageDetails = body.messageDetails || requirementSummary;
  const urgency: UrgencyLevel = body.urgency || "normal";
  const transcript: string[] = Array.isArray(body.transcript) ? body.transcript : [];

  let bookedAppointmentId: string | undefined = body.appointmentId;
  let bookingOutcome = null;

  if (body.preferredDate && body.preferredTime && !bookedAppointmentId) {
    bookingOutcome = await bookAppointmentAndConfirm({
      callerName,
      callerPhone,
      date: body.preferredDate,
      startTime: body.preferredTime,
      requirementSummary,
      sendSmsImmediately: true,
    });
    if (bookingOutcome.success && bookingOutcome.appointment) {
      bookedAppointmentId = bookingOutcome.appointment.id;
    }
  }

  const refreshedDb = readDb();
  const newCall: CallSummaryRecord = {
    id: `call_${Date.now().toString(36)}`,
    callerName,
    callerPhone,
    calledAt: new Date().toISOString(),
    isAfterHours: !officeStatus.isOpen,
    requirementSummary,
    messageDetails,
    urgency,
    appointmentId: bookedAppointmentId,
    transcript:
      transcript.length > 0
        ? transcript
        : [
            `Nora: ${refreshedDb.settings.afterHoursGreeting}`,
            `Caller (${callerName}): ${messageDetails}`,
            bookedAppointmentId
              ? `Nora: Booked appointment ${bookedAppointmentId} for ${body.preferredDate} at ${body.preferredTime} and sent SMS confirmation to ${callerPhone}.`
              : `Nora: Summarized requirement ("${requirementSummary}") for office follow-up.`,
          ],
  };

  refreshedDb.calls.unshift(newCall);
  writeDb(refreshedDb);

  return NextResponse.json({
    success: true,
    call: newCall,
    bookingOutcome,
  });
}

