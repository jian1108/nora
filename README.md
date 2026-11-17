# Nora — AI Office Receptionist (LiveKit Phone Numbers + LobbyStack Architecture)

Nora is a self-hostable AI Office Receptionist inspired by [LobbyStack](https://github.com/lobbystack/lobbystack) and powered by **LiveKit Phone Numbers** + **LiveKit Agents (Python)** + **Next.js Admin & Scheduler API**.

## Key Features
1. **After-Hours Phone Answering via LiveKit Phone Numbers ($0 SIP Trunk)**:
   - Uses LiveKit Cloud's first-party US local or toll-free phone numbers (1 free US number + monthly free inbound minutes included on every LiveKit Cloud plan).
   - Automatically detects whether the office is currently open or in **After-Hours Reception Mode**.
   - Greets callers warmly, captures their requirements, and saves a structured call summary + urgency rating (`low`, `normal`, `urgent`) + transcript.
2. **Real-Time Calendar Availability & Auto-Booking**:
   - Exposes `check_calendar_availability` and `book_appointment` tools to the LiveKit Voice Agent.
   - Prevents double-booking and supports **2-way Google Calendar sync** (`freebusy` query + `events.insert`) alongside the built-in local scheduler database.
3. **Scheduler Verification & SMS Booking Confirmation**:
   - Automatically dispatches an SMS confirmation to the caller's phone number (`sip.phoneNumber`) as soon as an appointment is booked, or via the `/api/scheduler` verification sweep (`verify_and_send_sms`).
   - Includes a **$0 Dashboard SMS Outbox Simulator** out of the box, plus pluggable adapters for low-cost outbound SMS (`textbelt`, `telnyx`, `webhook`).

---

## Project Structure

- `apps/web/` — Next.js 15 (TypeScript + Tailwind CSS) Admin Dashboard, Interactive After-Hours Call Simulator, Scheduler Engine, Google Calendar Sync, and SMS Confirmation Dispatcher.
- `apps/agent/` — Python LiveKit Voice Agent (`agent.py`, `tools.py`, `prompts.py`, and `livekit-dispatch-rule.json`).

---

## Quick Start

### 1. Start the Next.js Reception Dashboard & Scheduler API
```bash
cd apps/web
npm install
npm run dev
```
Open `http://localhost:3000` to:
- View **After-Hours Call Summaries & Transcripts**
- Inspect **Calendar Availability & Auto-Booked Appointments**
- View **SMS Booking Confirmations** in the Outbox
- Run the **Interactive After-Hours Call Simulator**

### 2. Start the Python LiveKit Voice Agent
Use Python 3.13 (recommended for prebuilt wheels with `livekit-agents`):
```powershell
cd apps/agent
py -3.13 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python agent.py dev
```

### 3. Provision Your Free LiveKit Phone Number (No Twilio/Telnyx Needed)
Using the LiveKit CLI (`lk`) or the LiveKit Cloud Dashboard (`Telephony → Phone Numbers`):
```bash
# 1. Create the dispatch rule that routes inbound calls to "nora-receptionist"
lk sip dispatch create apps/agent/livekit-dispatch-rule.json

# 2. Search and purchase your free US local number in LiveKit Cloud
lk number search --country US --area-code 415
```
Attach the phone number to the `nora-after-hours-dispatch` rule in the LiveKit Cloud dashboard and dial your number!

