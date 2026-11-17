import { AppointmentRecord, readDb, SmsLogRecord, writeDb } from "./db";

/**
 * Pluggable SMS Confirmation Engine.
 * Works alongside first-party LiveKit Phone Numbers:
 * - Default ("outbox"): Zero-cost local SMS Outbox simulator visible in the Admin Dashboard.
 * - "textbelt": Simple pay-as-you-go SMS API with no monthly number rental.
 * - "telnyx" / "twilio": Direct REST API call without needing any voice SIP trunk.
 * - "webhook": Generic webhook for n8n / Zapier / AWS SNS / Email-to-SMS.
 */
export async function sendBookingConfirmationSms(
  appointment: AppointmentRecord,
  officeName: string
): Promise<{ sent: boolean; message: string; provider: string }> {
  const provider = (process.env.SMS_PROVIDER || "outbox").toLowerCase();
  const bodyText = `[${officeName}] Hi ${appointment.callerName}! Your appointment is CONFIRMED for ${appointment.date} at ${appointment.startTime}–${appointment.endTime}. Summary: ${appointment.requirementSummary}. Ref: ${appointment.id}`;

  let status: SmsLogRecord["status"] = "SIMULATED_OUTBOX";
  let providerLabel = "outbox (LiveKit Phone Number companion)";

  try {
    if (provider === "textbelt" && process.env.SMS_API_KEY) {
      providerLabel = "textbelt";
      const res = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: appointment.callerPhone,
          message: bodyText,
          key: process.env.SMS_API_KEY,
        }),
      });
      const data = (await res.json()) as { success?: boolean };
      status = data.success ? "SENT" : "FAILED";
    } else if (provider === "telnyx" && process.env.SMS_API_KEY && process.env.SMS_FROM_NUMBER) {
      providerLabel = "telnyx-sms";
      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SMS_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.SMS_FROM_NUMBER,
          to: appointment.callerPhone,
          text: bodyText,
        }),
      });
      status = res.ok ? "SENT" : "FAILED";
    } else if (provider === "webhook" && process.env.SMS_WEBHOOK_URL) {
      providerLabel = "webhook";
      const res = await fetch(process.env.SMS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: appointment.callerPhone,
          recipientName: appointment.callerName,
          message: bodyText,
          appointmentId: appointment.id,
        }),
      });
      status = res.ok ? "SENT" : "FAILED";
    }
  } catch (err) {
    console.error("Failed to dispatch external SMS:", err);
    status = "FAILED";
  }

  const db = readDb();
  const smsEntry: SmsLogRecord = {
    id: `sms_${Date.now().toString(36)}`,
    toPhone: appointment.callerPhone,
    recipientName: appointment.callerName,
    appointmentId: appointment.id,
    message: bodyText,
    provider: providerLabel,
    status,
    sentAt: new Date().toISOString(),
  };

  db.smsLogs.unshift(smsEntry);

  const aptIndex = db.appointments.findIndex((a) => a.id === appointment.id);
  if (aptIndex !== -1 && status !== "FAILED") {
    db.appointments[aptIndex].smsSent = true;
    db.appointments[aptIndex].status = "CONFIRMED";
    db.appointments[aptIndex].smsConfirmedAt = smsEntry.sentAt;
  }

  writeDb(db);

  return {
    sent: status !== "FAILED",
    message: bodyText,
    provider: providerLabel,
  };
}

/**
 * Requirement #2: Check the scheduler for any unconfirmed / pending appointments
 * and send out SMS booking confirmations automatically.
 */
export async function verifySchedulerAndSendPendingConfirmations(): Promise<{
  checkedCount: number;
  newlyConfirmedCount: number;
  confirmations: { appointmentId: string; callerPhone: string; message: string }[];
}> {
  const db = readDb();
  const pendingAppointments = db.appointments.filter(
    (a) => a.status === "SCHEDULED" && !a.smsSent
  );

  const confirmations: { appointmentId: string; callerPhone: string; message: string }[] = [];

  for (const apt of pendingAppointments) {
    const res = await sendBookingConfirmationSms(apt, db.settings.officeName);
    if (res.sent) {
      confirmations.push({
        appointmentId: apt.id,
        callerPhone: apt.callerPhone,
        message: res.message,
      });
    }
  }

  return {
    checkedCount: db.appointments.length,
    newlyConfirmedCount: confirmations.length,
    confirmations,
  };
}

