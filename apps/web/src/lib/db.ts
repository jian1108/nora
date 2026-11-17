import fs from "fs";
import path from "path";

export type UrgencyLevel = "low" | "normal" | "urgent";

export interface OfficeHoursDay {
  day: string; // "Monday" .. "Sunday"
  open: string; // "08:00"
  close: string; // "18:00"
  closed: boolean;
}

export interface OfficeSettings {
  officeName: string;
  timezone: string;
  forceAfterHoursMode: boolean; // Toggle in UI to test after-hours immediately
  slotDurationMinutes: number;
  afterHoursGreeting: string;
  schedule: OfficeHoursDay[];
}

export interface CallSummaryRecord {
  id: string;
  callerPhone: string;
  callerName: string;
  calledAt: string;
  isAfterHours: boolean;
  requirementSummary: string;
  messageDetails: string;
  urgency: UrgencyLevel;
  appointmentId?: string;
  transcript: string[];
}

export interface AppointmentRecord {
  id: string;
  callerName: string;
  callerPhone: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  requirementSummary: string;
  status: "SCHEDULED" | "CONFIRMED" | "CANCELLED";
  smsSent: boolean;
  smsConfirmedAt?: string;
  googleEventId?: string;
  createdAt: string;
}

export interface SmsLogRecord {
  id: string;
  toPhone: string;
  recipientName: string;
  appointmentId: string;
  message: string;
  provider: string;
  status: "SENT" | "SIMULATED_OUTBOX" | "FAILED";
  sentAt: string;
}

export interface DatabaseSchema {
  settings: OfficeSettings;
  calls: CallSummaryRecord[];
  appointments: AppointmentRecord[];
  smsLogs: SmsLogRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "nora-db.json");

const DEFAULT_DB: DatabaseSchema = {
  settings: {
    officeName: process.env.OFFICE_NAME || "Ori Home Improvement",
    timezone: process.env.OFFICE_TIMEZONE || "America/New_York",
    forceAfterHoursMode: true,
    slotDurationMinutes: 60,
    afterHoursGreeting:
      "Thank you for calling Ori Home Improvement, Central New Jersey's trusted home remodeling contractor for over 20 years. Our office is currently closed for the evening, but I'm Nora, Ori's automated assistant. I can take down the details of your kitchen, bathroom, flooring, or home renovation project and check our calendar to book your free estimate right now. How can I help transform your home today?",
    schedule: [
      { day: "Monday", open: "08:00", close: "18:00", closed: false },
      { day: "Tuesday", open: "08:00", close: "18:00", closed: false },
      { day: "Wednesday", open: "08:00", close: "18:00", closed: false },
      { day: "Thursday", open: "08:00", close: "18:00", closed: false },
      { day: "Friday", open: "08:00", close: "17:00", closed: false },
      { day: "Saturday", open: "09:00", close: "14:00", closed: true },
      { day: "Sunday", open: "00:00", close: "00:00", closed: true },
    ],
  },
  calls: [
    {
      id: "call_ori_1",
      callerPhone: "+16095550184",
      callerName: "David Miller",
      calledAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      isAfterHours: true,
      requirementSummary:
        "Complete Kitchen Remodeling (Custom Cabinets, Island & Hardwood Flooring) in Princeton, NJ",
      messageDetails:
        "Homeowner in Princeton, NJ looking for a full kitchen renovation including new shaker cabinets, quartz countertops, tile backsplash, and 450 sq ft of oak flooring. Wants an in-home consultation & estimate with Ori.",
      urgency: "normal",
      appointmentId: "apt_ori_1",
      transcript: [
        "Nora: Thank you for calling Ori Home Improvement, Central New Jersey's trusted home remodeling contractor for over 20 years. Our office is currently closed, but I can take down the details of your remodeling project and book your estimate right now.",
        "Caller: Hi, I'm David Miller in Princeton. My wife and I want to remodel our kitchen—new cabinets, quartz countertops, and replacing the kitchen and dining room flooring.",
        "Nora: That sounds like a wonderful project, David! Let me check Ori's calendar for tomorrow so we can get your in-home consultation scheduled.",
        "Nora: We have 10:00 AM and 2:00 PM open tomorrow. Which time works better for you?",
        "Caller: 10:00 AM tomorrow is great.",
        "Nora: Perfect! I've booked your kitchen & flooring consultation for 10:00 AM tomorrow and sent a confirmation text message to +16095550184.",
      ],
    },
  ],
  appointments: [
    {
      id: "apt_ori_1",
      callerName: "David Miller",
      callerPhone: "+16095550184",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().split("T")[0],
      startTime: "10:00",
      endTime: "11:00",
      requirementSummary:
        "Complete Kitchen Remodeling (Custom Cabinets, Island & Hardwood Flooring) in Princeton, NJ",
      status: "CONFIRMED",
      smsSent: true,
      smsConfirmedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    },
  ],
  smsLogs: [
    {
      id: "sms_ori_1",
      toPhone: "+16095550184",
      recipientName: "David Miller",
      appointmentId: "apt_ori_1",
      message:
        "[Ori Home Improvement] Hi David Miller! Your remodeling estimate & consultation is CONFIRMED for tomorrow at 10:00–11:00. Project: Complete Kitchen Remodeling & Hardwood Flooring (Princeton, NJ). Reply RESCHEDULE or CANCEL anytime.",
      provider: "outbox (LiveKit Phone Number companion)",
      status: "SIMULATED_OUTBOX",
      sentAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    },
  ],
};

export function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf-8");
      return structuredClone(DEFAULT_DB);
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export function writeDb(data: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function checkIsOfficeOpenNow(settings: OfficeSettings): {
  isOpen: boolean;
  reason: string;
  currentDay: string;
  currentTime: string;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const currentDay = parts.find((p) => p.type === "weekday")?.value || "Monday";
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  const currentTime = `${hour === "24" ? "00" : hour}:${minute}`;

  if (settings.forceAfterHoursMode) {
    return {
      isOpen: false,
      reason: "Force After-Hours Receptionist Mode is enabled in dashboard settings.",
      currentDay,
      currentTime,
    };
  }

  const rule = settings.schedule.find(
    (d) => d.day.toLowerCase() === currentDay.toLowerCase()
  );

  if (!rule || rule.closed) {
    return {
      isOpen: false,
      reason: `Office is closed on ${currentDay}s.`,
      currentDay,
      currentTime,
    };
  }

  const isWithinHours = currentTime >= rule.open && currentTime < rule.close;
  return {
    isOpen: isWithinHours,
    reason: isWithinHours
      ? `Office is currently open (${rule.open} - ${rule.close}).`
      : `After office hours (open ${rule.open} - ${rule.close}, current time ${currentTime}).`,
    currentDay,
    currentTime,
  };
}
