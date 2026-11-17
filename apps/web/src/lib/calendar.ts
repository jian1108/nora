import { google } from "googleapis";
import { AppointmentRecord, readDb, writeDb } from "./db";
import { sendBookingConfirmationSms } from "./sms";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

async function getGoogleCalendarBusySlots(
  date: string,
  timezone: string
): Promise<{ start: string; end: string }[]> {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  if (!clientEmail || !privateKey) {
    return [];
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: timezone,
        items: [{ id: calendarId }],
      },
    });

    const busyList = response.data.calendars?.[calendarId]?.busy || [];
    return busyList
      .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
      .map((b) => {
        const startDt = new Date(b.start);
        const endDt = new Date(b.end);
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        return {
          start: fmt.format(startDt),
          end: fmt.format(endDt),
        };
      });
  } catch (err) {
    console.warn("Google Calendar freebusy check skipped or failed:", err);
    return [];
  }
}

async function insertGoogleCalendarEvent(
  apt: AppointmentRecord,
  timezone: string,
  officeName: string
): Promise<string | undefined> {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  if (!clientEmail || !privateKey) {
    return undefined;
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `[Nora Auto-Booked] ${apt.callerName} (${apt.callerPhone})`,
        description: `Requirement Summary: ${apt.requirementSummary}\nBooked by Nora AI Receptionist (${officeName})`,
        start: {
          dateTime: `${apt.date}T${apt.startTime}:00`,
          timeZone: timezone,
        },
        end: {
          dateTime: `${apt.date}T${apt.endTime}:00`,
          timeZone: timezone,
        },
      },
    });

    return res.data.id || undefined;
  } catch (err) {
    console.warn("Google Calendar event insert skipped or failed:", err);
    return undefined;
  }
}

export async function getAvailableSlotsForDate(date: string): Promise<{
  date: string;
  dayOfWeek: string;
  isClosedDay: boolean;
  availableSlots: string[];
  bookedSlots: { startTime: string; endTime: string; callerName: string }[];
  googleCalendarSynced: boolean;
}> {
  const db = readDb();
  const parsedDate = new Date(`${date}T12:00:00Z`);
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsedDate);

  const daySchedule = db.settings.schedule.find(
    (d) => d.day.toLowerCase() === dayOfWeek.toLowerCase()
  );

  if (!daySchedule || daySchedule.closed) {
    return {
      date,
      dayOfWeek,
      isClosedDay: true,
      availableSlots: [],
      bookedSlots: [],
      googleCalendarSynced: Boolean(process.env.GOOGLE_CLIENT_EMAIL),
    };
  }

  const slotDuration = db.settings.slotDurationMinutes || 30;
  const openMins = timeToMinutes(daySchedule.open);
  const closeMins = timeToMinutes(daySchedule.close);

  const existingAppointments = db.appointments.filter(
    (a) => a.date === date && a.status !== "CANCELLED"
  );

  const gcalBusy = await getGoogleCalendarBusySlots(date, db.settings.timezone);

  const availableSlots: string[] = [];
  for (let start = openMins; start + slotDuration <= closeMins; start += slotDuration) {
    const end = start + slotDuration;
    const startStr = minutesToTime(start);
    const endStr = minutesToTime(end);

    const overlapsInternal = existingAppointments.some((apt) => {
      const aStart = timeToMinutes(apt.startTime);
      const aEnd = timeToMinutes(apt.endTime);
      return start < aEnd && end > aStart;
    });

    const overlapsGcal = gcalBusy.some((busy) => {
      const bStart = timeToMinutes(busy.start);
      const bEnd = timeToMinutes(busy.end);
      return start < bEnd && end > bStart;
    });

    if (!overlapsInternal && !overlapsGcal) {
      availableSlots.push(startStr);
    }
  }

  return {
    date,
    dayOfWeek,
    isClosedDay: false,
    availableSlots,
    bookedSlots: existingAppointments.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      callerName: a.callerName,
    })),
    googleCalendarSynced: Boolean(process.env.GOOGLE_CLIENT_EMAIL),
  };
}

export async function bookAppointmentAndConfirm(params: {
  callerName: string;
  callerPhone: string;
  date: string;
  startTime: string;
  requirementSummary: string;
  sendSmsImmediately?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  appointment?: AppointmentRecord;
  smsConfirmation?: { sent: boolean; message: string; provider: string };
}> {
  const availability = await getAvailableSlotsForDate(params.date);
  if (availability.isClosedDay) {
    return {
      success: false,
      error: `The office is closed on ${availability.dayOfWeek} (${params.date}).`,
    };
  }

  if (!availability.availableSlots.includes(params.startTime)) {
    return {
      success: false,
      error: `Slot ${params.startTime} on ${params.date} is not available. Open slots: ${
        availability.availableSlots.slice(0, 6).join(", ") || "none"
      }`,
    };
  }

  const db = readDb();
  const duration = db.settings.slotDurationMinutes || 30;
  const endTime = minutesToTime(timeToMinutes(params.startTime) + duration);

  const newAppointment: AppointmentRecord = {
    id: `apt_${Date.now().toString(36)}`,
    callerName: params.callerName,
    callerPhone: params.callerPhone,
    date: params.date,
    startTime: params.startTime,
    endTime,
    requirementSummary: params.requirementSummary,
    status: "SCHEDULED",
    smsSent: false,
    createdAt: new Date().toISOString(),
  };

  const googleEventId = await insertGoogleCalendarEvent(
    newAppointment,
    db.settings.timezone,
    db.settings.officeName
  );
  if (googleEventId) {
    newAppointment.googleEventId = googleEventId;
  }

  db.appointments.unshift(newAppointment);
  writeDb(db);

  let smsResult = {
    sent: false,
    message: "",
    provider: "none",
  };

  if (params.sendSmsImmediately !== false) {
    smsResult = await sendBookingConfirmationSms(newAppointment, db.settings.officeName);
  }

  const refreshedDb = readDb();
  const updatedApt = refreshedDb.appointments.find((a) => a.id === newAppointment.id);

  return {
    success: true,
    appointment: updatedApt || newAppointment,
    smsConfirmation: smsResult,
  };
}

