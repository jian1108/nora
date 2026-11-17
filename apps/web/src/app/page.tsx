"use client";

import React, { useEffect, useState } from "react";
import {
  PhoneCall,
  Calendar,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Send,
  PhoneIncoming,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { LiveVoiceDialer } from "@/components/LiveVoiceDialer";

interface OfficeHoursDay {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

interface OfficeSettings {
  officeName: string;
  timezone: string;
  forceAfterHoursMode: boolean;
  slotDurationMinutes: number;
  afterHoursGreeting: string;
  schedule: OfficeHoursDay[];
}

interface CallSummaryRecord {
  id: string;
  callerPhone: string;
  callerName: string;
  calledAt: string;
  isAfterHours: boolean;
  requirementSummary: string;
  messageDetails: string;
  urgency: "low" | "normal" | "urgent";
  appointmentId?: string;
  transcript: string[];
}

interface AppointmentRecord {
  id: string;
  callerName: string;
  callerPhone: string;
  date: string;
  startTime: string;
  endTime: string;
  requirementSummary: string;
  status: "SCHEDULED" | "CONFIRMED" | "CANCELLED";
  smsSent: boolean;
  smsConfirmedAt?: string;
  googleEventId?: string;
  createdAt: string;
}

interface SmsLogRecord {
  id: string;
  toPhone: string;
  recipientName: string;
  appointmentId: string;
  message: string;
  provider: string;
  status: "SENT" | "SIMULATED_OUTBOX" | "FAILED";
  sentAt: string;
}

export default function NoraDashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "simulator" | "calendar" | "sms" | "settings"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallSummaryRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLogRecord[]>([]);
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [officeStatus, setOfficeStatus] = useState<{
    isOpen: boolean;
    reason: string;
    currentDay: string;
    currentTime: string;
  } | null>(null);

  // Calendar inspector state
  const tomorrowDate = new Date(Date.now() + 86400000)
    .toISOString()
    .split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowDate);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  // Simulator state
  const [simCallerName, setSimCallerName] = useState("Sarah Jenkins");
  const [simCallerPhone, setSimCallerPhone] = useState("+16095550148");
  const [simMessage, setSimMessage] = useState(
    "Hi, we live in West Windsor, NJ and want to remodel our master bathroom—new walk-in tile shower, double vanity, and heated flooring. Looking to schedule a free estimate with Ori tomorrow afternoon."
  );
  const [simUrgency, setSimUrgency] = useState<"low" | "normal" | "urgent">(
    "normal"
  );
  const [simDate, setSimDate] = useState(tomorrowDate);
  const [simTime, setSimTime] = useState("14:00");
  const [simStatusMessage, setSimStatusMessage] = useState<string | null>(null);
  const [isSubmittingSim, setIsSubmittingSim] = useState(false);

  async function fetchAllData(dateToQuery = selectedDate) {
    setLoading(true);
    try {
      const [callsRes, schedRes] = await Promise.all([
        fetch("/api/calls"),
        fetch(`/api/scheduler?date=${dateToQuery}`),
      ]);
      const callsData = await callsRes.json();
      const schedData = await schedRes.json();

      setCalls(callsData.calls || []);
      setAppointments(callsData.appointments || []);
      setSmsLogs(callsData.smsLogs || []);
      setSettings(callsData.settings || null);
      setOfficeStatus(callsData.officeStatus || null);
      setAvailableSlots(schedData.availableSlots || []);
    } catch (e) {
      console.error("Failed to fetch dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAllData(selectedDate);
  }, [selectedDate]);

  async function handleToggleAfterHours() {
    if (!settings) return;
    const res = await fetch("/api/office-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forceAfterHoursMode: !settings.forceAfterHoursMode,
      }),
    });
    const data = await res.json();
    setSettings(data.settings);
    setOfficeStatus(data.status);
  }

  async function handleVerifySchedulerAndSendSms() {
    const res = await fetch("/api/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_and_send_sms" }),
    });
    const report = await res.json();
    setSimStatusMessage(
      `Scheduler verified ${report.checkedCount} appointments. Dispatched ${report.newlyConfirmedCount} pending SMS confirmation(s).`
    );
    await fetchAllData(selectedDate);
  }

  async function handleSimulateAfterHoursCall(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingSim(true);
    setSimStatusMessage(null);

    try {
      const summaryText =
        simMessage.length > 90
          ? simMessage.slice(0, 87).trim() + "..."
          : simMessage;

      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerName: simCallerName,
          callerPhone: simCallerPhone,
          requirementSummary: summaryText,
          messageDetails: simMessage,
          urgency: simUrgency,
          preferredDate: simDate,
          preferredTime: simTime,
          transcript: [
            `Nora (LiveKit Agent): ${settings?.afterHoursGreeting}`,
            `${simCallerName} (${simCallerPhone}): ${simMessage}`,
            `Nora (LiveKit Agent): I've summarized your requirement ("${summaryText}"). Checking our calendar for ${simDate} at ${simTime}...`,
            `Nora (LiveKit Agent): That slot is open! I have booked your appointment for ${simDate} at ${simTime} and triggered your SMS booking confirmation to ${simCallerPhone}.`,
          ],
        }),
      });
      const data = await res.json();
      if (data.bookingOutcome?.success) {
        setSimStatusMessage(
          `Call summarized & Appointment ${data.bookingOutcome.appointment.id} auto-booked for ${simDate} at ${simTime}! SMS confirmation dispatched to ${simCallerPhone}.`
        );
      } else if (data.bookingOutcome?.error) {
        setSimStatusMessage(
          `Call summarized, but slot ${simTime} was unavailable: ${data.bookingOutcome.error}`
        );
      } else {
        setSimStatusMessage("Call requirement summarized and logged!");
      }
      await fetchAllData(simDate);
    } finally {
      setIsSubmittingSim(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0d1322]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <PhoneIncoming className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Nora AI Receptionist
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  LiveKit Phone Numbers + Agents
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {settings?.officeName || "Loading office..."} • LobbyStack-inspired
                Self-Hostable Office Automation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {officeStatus && (
              <button
                onClick={handleToggleAfterHours}
                title="Click to toggle Force After-Hours Mode for testing"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                  !officeStatus.isOpen
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                    : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {!officeStatus.isOpen
                  ? "After-Hours Reception ACTIVE"
                  : "Office Currently OPEN"}
              </button>
            )}

            <button
              onClick={() => fetchAllData(selectedDate)}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {[
            { id: "overview", label: "Reception Overview", icon: PhoneCall },
            {
              id: "simulator",
              label: "After-Hours Call Simulator",
              icon: Sparkles,
            },
            {
              id: "calendar",
              label: "Calendar & Auto-Bookings",
              icon: Calendar,
            },
            {
              id: "sms",
              label: `SMS Confirmations (${smsLogs.length})`,
              icon: MessageSquare,
            },
            {
              id: "settings",
              label: "LiveKit Phone & Office Hours",
              icon: Settings,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  active
                    ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {simStatusMessage && (
          <div className="p-4 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-indigo-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>{simStatusMessage}</span>
            </div>
            <button
              onClick={() => setSimStatusMessage(null)}
              className="text-xs text-indigo-300 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>After-Hours Calls Handled</span>
              <PhoneCall className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{calls.length}</div>
            <div className="text-xs text-slate-400 mt-1">
              100% requirements summarized
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Auto-Booked Appointments</span>
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {appointments.length}
            </div>
            <div className="text-xs text-emerald-400 mt-1">
              Conflict-checked against schedule
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>SMS Booking Confirmations</span>
              <MessageSquare className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {smsLogs.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Dispatched on booking & scheduler check
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Telephony Engine</span>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-base font-bold text-white truncate">
              LiveKit Phone Numbers
            </div>
            <div className="text-xs text-purple-300 mt-1">
              $0 SIP Trunk • 1 Free US Local Number
            </div>
          </div>
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Summarized After-Hours Calls */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <PhoneIncoming className="w-4 h-4 text-indigo-400" />
                  After-Hours Call Summaries & Caller Requirements
                </h2>
                <button
                  onClick={() => setActiveTab("simulator")}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                >
                  + Test Incoming Call
                </button>
              </div>

              <div className="space-y-3">
                {calls.map((call) => (
                  <div
                    key={call.id}
                    className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            {call.callerName}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {call.callerPhone}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              call.urgency === "urgent"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : call.urgency === "normal"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-slate-700 text-slate-300"
                            }`}
                          >
                            {call.urgency.toUpperCase()}
                          </span>
                          {call.isAfterHours && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              After-Hours
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(call.calledAt).toLocaleString()}
                        </p>
                      </div>

                      {call.appointmentId && (
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Auto-Booked ({call.appointmentId})
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90">
                      <div className="text-xs font-medium text-indigo-300 mb-1">
                        AI Requirement Summary:
                      </div>
                      <p className="text-sm text-slate-200">
                        {call.requirementSummary}
                      </p>
                      {call.messageDetails !== call.requirementSummary && (
                        <p className="text-xs text-slate-400 mt-1">
                          Full Message: {call.messageDetails}
                        </p>
                      )}
                    </div>

                    {call.transcript && call.transcript.length > 0 && (
                      <details className="text-xs text-slate-400">
                        <summary className="cursor-pointer hover:text-slate-200 font-medium">
                          View Call Transcript ({call.transcript.length} turns)
                        </summary>
                        <div className="mt-2 p-3 rounded-lg bg-black/40 space-y-1.5 font-mono text-[11px] text-slate-300">
                          {call.transcript.map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Upcoming Appointments & SMS Verification */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  Booked Appointments
                </h2>
                <button
                  onClick={handleVerifySchedulerAndSendSms}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1.5 transition"
                >
                  <Send className="w-3 h-3" />
                  Verify & Send SMS
                </button>
              </div>

              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-white">
                        {apt.callerName}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          apt.status === "CONFIRMED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {apt.status}
                      </span>
                    </div>
                    <div className="text-xs text-indigo-300 font-medium">
                      {apt.date} • {apt.startTime} – {apt.endTime}
                    </div>
                    <p className="text-xs text-slate-400">
                      {apt.requirementSummary}
                    </p>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{apt.callerPhone}</span>
                      <span>
                        {apt.smsSent ? "✅ SMS Confirmation Sent" : "⏳ SMS Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SIMULATOR TAB */}
        {activeTab === "simulator" && (
          <div className="space-y-6">
            {/* Real LiveKit WebRTC Microphone Dialer */}
            <LiveVoiceDialer
              defaultCallerName={simCallerName}
              defaultCallerPhone={simCallerPhone}
              onCallEnded={() => fetchAllData(selectedDate)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    API Tool-Pipeline Tester (No Microphone Needed)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Triggers the backend REST pipeline (`check_office_hours` →
                    `check_availability` → `book_appointment` → `send_sms` →
                    `save_call_summary`) directly without speaking aloud.
                  </p>
                </div>

              <form
                onSubmit={handleSimulateAfterHoursCall}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Caller Name
                    </label>
                    <input
                      type="text"
                      value={simCallerName}
                      onChange={(e) => setSimCallerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Caller Phone (`sip.phoneNumber`)
                    </label>
                    <input
                      type="text"
                      value={simCallerPhone}
                      onChange={(e) => setSimCallerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Caller Spoken Requirement / Message
                  </label>
                  <textarea
                    rows={3}
                    value={simMessage}
                    onChange={(e) => setSimMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Urgency
                    </label>
                    <select
                      value={simUrgency}
                      onChange={(e) =>
                        setSimUrgency(
                          e.target.value as "low" | "normal" | "urgent"
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Requested Date
                    </label>
                    <input
                      type="date"
                      value={simDate}
                      onChange={(e) => {
                        setSimDate(e.target.value);
                        setSelectedDate(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Requested Slot (Open)
                    </label>
                    <select
                      value={simTime}
                      onChange={(e) => setSimTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    >
                      {availableSlots.length > 0 ? (
                        availableSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))
                      ) : (
                        <option value="14:00">14:00</option>
                      )}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSim}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition flex items-center justify-center gap-2"
                >
                  <PhoneIncoming className="w-4 h-4" />
                  {isSubmittingSim
                    ? "Running Receptionist Workflow..."
                    : "Run After-Hours Call → Summarize → Auto-Book → Send SMS"}
                </button>
              </form>
            </div>

            <div className="p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
              <h3 className="text-base font-semibold text-white">
                How LiveKit Phone Numbers Connects to Python Agent
              </h3>
              <ol className="text-xs text-slate-300 space-y-3 list-decimal list-inside">
                <li>
                  <strong className="text-white">
                    Claim Your Free US Number in LiveKit Cloud:
                  </strong>{" "}
                  Run{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    lk number search --country US
                  </code>{" "}
                  or open the LiveKit Cloud Dashboard →{" "}
                  <em>Telephony → Phone Numbers</em>.
                </li>
                <li>
                  <strong className="text-white">
                    Attach Dispatch Rule (`nora-receptionist`):
                  </strong>{" "}
                  When a caller dials your LiveKit number, LiveKit places them in
                  a room with{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    sip.phoneNumber
                  </code>{" "}
                  populated automatically and wakes up{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    apps/agent/agent.py
                  </code>
                  .
                </li>
                <li>
                  <strong className="text-white">
                    After-Hours Check & Calendar Tool Calls:
                  </strong>{" "}
                  The Python agent calls{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    check_office_hours()
                  </code>
                  , summarizes the caller&apos;s issue, queries{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    check_calendar_availability()
                  </code>
                  , and books via{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                    book_appointment()
                  </code>
                  .
                </li>
                <li>
                  <strong className="text-white">
                    Immediate SMS Booking Confirmation:
                  </strong>{" "}
                  As soon as the appointment is booked, the scheduler dispatches
                  the confirmation SMS and updates the appointment status to{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-emerald-300">
                    CONFIRMED
                  </code>
                  .
                </li>
              </ol>
            </div>
            </div>
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === "calendar" && (
          <div className="p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Scheduler Availability & Google Calendar Sync
                </h2>
                <p className="text-xs text-slate-400">
                  Select any date to inspect live 30-minute slots available to
                  the Nora Voice Agent.
                </p>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
              />
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Open Slots on {selectedDate} ({availableSlots.length} available)
              </h3>
              {availableSlots.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-900 text-slate-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  No open slots on this date (office closed or fully booked).
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                  {availableSlots.map((slot) => (
                    <div
                      key={slot}
                      className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono text-center"
                    >
                      {slot}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SMS CONFIRMATIONS TAB */}
        {activeTab === "sms" && (
          <div className="p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  SMS Booking Confirmation Outbox
                </h2>
                <p className="text-xs text-slate-400">
                  Every appointment auto-booked by Nora or verified by the
                  scheduler triggers an SMS confirmation here.
                </p>
              </div>
              <button
                onClick={handleVerifySchedulerAndSendSms}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                Run Scheduler Check & Send Pending SMS
              </button>
            </div>

            <div className="space-y-3">
              {smsLogs.map((sms) => (
                <div
                  key={sms.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        To: {sms.recipientName} ({sms.toPhone})
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {sms.status}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(sms.sentAt).toLocaleString()} • via{" "}
                      {sms.provider}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-mono bg-black/40 p-3 rounded-lg border border-slate-800">
                    {sms.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && settings && (
          <div className="p-6 rounded-xl bg-[#111827] border border-slate-800 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">
                Office Hours & After-Hours Greeting Configuration
              </h2>
              <p className="text-xs text-slate-400">
                The LiveKit Python Agent checks these hours on every incoming
                call to decide whether to run After-Hours Intake & Auto-Booking.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                After-Hours Spoken Greeting
              </label>
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200">
                {settings.afterHoursGreeting}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {settings.schedule.map((day) => (
                <div
                  key={day.day}
                  className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <span className="text-xs font-semibold text-white">
                    {day.day}
                  </span>
                  {day.closed ? (
                    <span className="text-xs text-rose-400 font-medium">
                      Closed (After-Hours Active)
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-400 font-mono">
                      {day.open} – {day.close}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

