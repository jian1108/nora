"""
Function tools exposed to the LiveKit Voice Receptionist Agent.
Communicates with the Next.js Scheduler, Calendar & SMS API (`apps/web`).
"""

import logging
import os
from typing import Annotated
import httpx
from livekit.agents import RunContext, get_job_context, llm

logger = logging.getLogger("nora-receptionist.tools")

WEB_API_BASE = os.getenv("NORA_WEB_API_URL", "http://localhost:3001").rstrip("/")


async def fetch_office_hours_state() -> dict:
    """Fetch current office hours & after-hours greeting from the backend."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{WEB_API_BASE}/api/office-hours")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Fallback office hours used (API unreachable: %s)", exc)
        return {
            "settings": {
                "officeName": os.getenv("OFFICE_NAME", "Ori Home Improvement"),
                "afterHoursGreeting": (
                    "Thank you for calling Ori Home Improvement, Central New Jersey's trusted home remodeling contractor. "
                    "Our office is currently closed, but I can take down the details of your remodeling project and check our calendar to book your free estimate right now."
                ),
            },
            "status": {
                "isOpen": False,
                "reason": "After office hours",
            },
        }


class ReceptionistTools(llm.ToolContext):
    """LiveKit Agent tools for office hours, calendar availability, auto-booking & SMS confirmation."""

    def __init__(self, caller_phone: str) -> None:
        super().__init__(tools=[])
        self.caller_phone = caller_phone

    @llm.function_tool(
        description="Check if the office is currently open or in after-hours mode, and return the schedule."
    )
    async def check_office_hours(self) -> str:
        data = await fetch_office_hours_state()
        status = data.get("status", {})
        is_open = status.get("isOpen", False)
        reason = status.get("reason", "After hours")
        return f"Office Open: {is_open}. Details: {reason}"

    @llm.function_tool(
        description="Check calendar availability for a specific date (YYYY-MM-DD) and return available 30-minute time slots."
    )
    async def check_calendar_availability(
        self,
        date: Annotated[
            str,
            "Date to check in YYYY-MM-DD format, e.g. 2026-11-16",
        ],
    ) -> str:
        logger.info("Checking calendar availability for %s", date)
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{WEB_API_BASE}/api/scheduler", params={"date": date}
            )
            data = resp.json()

        if data.get("isClosedDay"):
            return f"The office is closed on {data.get('dayOfWeek')} ({date}). Please ask the caller for another weekday."

        slots = data.get("availableSlots", [])
        if not slots:
            return f"No open slots remaining on {date}. Please check the next business day."

        preview = ", ".join(slots[:8])
        return (
            f"Available 30-minute slots on {date} ({data.get('dayOfWeek')}): {preview}. "
            f"(Total open slots: {len(slots)})"
        )

    @llm.function_tool(
        description=(
            "Book an appointment on the calendar for the caller and automatically send an SMS booking confirmation."
        )
    )
    async def book_appointment(
        self,
        caller_name: Annotated[str, "Full name of the caller"],
        date: Annotated[str, "Appointment date in YYYY-MM-DD format"],
        start_time: Annotated[
            str, "24-hour start time from available slots, e.g. '10:00' or '14:30'"
        ],
        requirement_summary: Annotated[
            str, "Concise summary of the caller's requirement or reason for visit"
        ],
        caller_phone: Annotated[
            str,
            "Caller's phone number for SMS confirmation (E.164 format, e.g. +14155550192)",
        ] = "",
    ) -> str:
        phone_to_use = caller_phone.strip() or self.caller_phone
        logger.info(
            "Auto-booking appointment for %s (%s) on %s at %s",
            caller_name,
            phone_to_use,
            date,
            start_time,
        )
        payload = {
            "callerName": caller_name,
            "callerPhone": phone_to_use,
            "date": date,
            "startTime": start_time,
            "requirementSummary": requirement_summary,
            "sendSmsImmediately": True,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{WEB_API_BASE}/api/scheduler", json=payload)
            result = resp.json()

        if not result.get("success"):
            return f"Could not book slot: {result.get('error', 'Unknown conflict')}"

        apt = result.get("appointment", {})
        sms = result.get("smsConfirmation", {})
        return (
            f"SUCCESS: Appointment {apt.get('id')} confirmed for {caller_name} on {date} "
            f"from {apt.get('startTime')} to {apt.get('endTime')}. "
            f"SMS Booking Confirmation sent={sms.get('sent')} to {phone_to_use}."
        )

    @llm.function_tool(
        description=(
            "Save the summarized caller requirement, full message details, and urgency level to the reception dashboard."
        )
    )
    async def save_call_summary(
        self,
        caller_name: Annotated[str, "Full name of the caller"],
        requirement_summary: Annotated[
            str, "Concise 1-sentence summary of what the caller needs"
        ],
        message_details: Annotated[
            str, "Complete details of the caller's message and context"
        ],
        urgency: Annotated[
            str, "Urgency level: 'low', 'normal', or 'urgent'"
        ] = "normal",
        appointment_id: Annotated[
            str, "Optional appointment ID if an appointment was already booked"
        ] = "",
    ) -> str:
        urgency_clean = (
            urgency.lower()
            if urgency.lower() in ("low", "normal", "urgent")
            else "normal"
        )
        payload = {
            "callerName": caller_name,
            "callerPhone": self.caller_phone,
            "requirementSummary": requirement_summary,
            "messageDetails": message_details,
            "urgency": urgency_clean,
            "appointmentId": appointment_id or None,
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(f"{WEB_API_BASE}/api/calls", json=payload)
            data = resp.json()

        call_id = data.get("call", {}).get("id", "logged")
        return f"Call requirement summary saved (id={call_id})."

    @llm.function_tool(
        description="Trigger a scheduler sweep to verify all scheduled appointments and send any pending SMS confirmations."
    )
    async def verify_scheduler_and_send_sms(self) -> str:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{WEB_API_BASE}/api/scheduler",
                json={"action": "verify_and_send_sms"},
            )
            report = resp.json()
        return (
            f"Scheduler verified {report.get('checkedCount', 0)} appointments and sent "
            f"{report.get('newlyConfirmedCount', 0)} pending SMS confirmations."
        )

    @llm.function_tool(
        description=(
            "Politely end and hang up the phone call once the appointment is booked (or message is saved) "
            "and the caller confirms they have no more questions."
        )
    )
    async def end_call(
        self,
        ctx: RunContext,
        farewell_message: Annotated[
            str,
            "Warm, brief goodbye message to speak to the homeowner before hanging up, e.g. "
            "'Thank you for calling Ori Home Improvement! Have a wonderful evening, goodbye.'",
        ] = "Thank you for calling Ori Home Improvement! We look forward to helping with your project. Have a wonderful day, goodbye!",
    ) -> str:
        logger.info("Initiating auto-hangup with farewell: %s", farewell_message)

        # Wait for any currently playing speech to finish
        await ctx.wait_for_playout()

        # Speak the final farewell message and wait for it to finish playing completely
        speech_handle = ctx.session.say(farewell_message, allow_interruptions=False)
        await speech_handle.wait_for_playout()

        # Tear down the LiveKit room so both WebRTC browser calls and PSTN/SIP phone calls hang up cleanly
        job_ctx = get_job_context()
        if job_ctx is not None:
            await job_ctx.delete_room()

        return "Call ended and disconnected."

