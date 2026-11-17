"""
Nora — AI Office Receptionist Worker built on LiveKit Agents + LiveKit Phone Numbers.

Supports:
1. LiveKit Inference out-of-the-box (ONLY needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET — no separate OpenAI/Deepgram keys required unless you want to override!)
2. First-party LiveKit Phone Numbers (reads caller ID from `sip.phoneNumber`)
3. Local Microphone Console Mode (`python agent.py console`) AND Browser/Phone Room Mode (`python agent.py dev`)
4. Real-time calendar availability check, auto-booking, call summarization, and SMS confirmation
"""

import logging
import os
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.plugins import deepgram, openai, silero

from prompts import build_receptionist_instructions
from tools import ReceptionistTools, fetch_office_hours_state

# Load .env from repo root or apps/agent/
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env.local"))
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nora-receptionist")


def extract_caller_phone(participant: rtc.RemoteParticipant | None) -> str:
    """
    Extract caller's PSTN phone number when dialed in via LiveKit Phone Numbers
    (`sip.phoneNumber` attribute) or from the Web Voice Dialer.
    """
    if participant is None:
        return "+14155550199"

    attrs = participant.attributes or {}
    if "sip.phoneNumber" in attrs:
        return attrs["sip.phoneNumber"]
    if "caller_phone" in attrs:
        return attrs["caller_phone"]
    if participant.identity and participant.identity.startswith("+"):
        return participant.identity
    return "+14155550199"


def create_voice_session() -> AgentSession:
    """
    Builds the speech pipeline:
    - By default, uses LiveKit Inference unified model strings ("deepgram/nova-3",
      "openai/gpt-4.1-mini", "cartesia/sonic-2") which work immediately with ONLY
      your LiveKit Cloud account credentials (no separate OpenAI/Deepgram billing needed).
    - If USE_DIRECT_PROVIDER_KEYS=true is set in .env, uses direct OpenAI + Deepgram plugins.
    """
    use_direct = os.getenv("USE_DIRECT_PROVIDER_KEYS", "false").lower() == "true"

    if use_direct and os.getenv("OPENAI_API_KEY") and os.getenv("DEEPGRAM_API_KEY"):
        logger.info("Using direct provider API keys (Deepgram + OpenAI plugins)")
        return AgentSession(
            vad=silero.VAD.load(),
            stt=deepgram.STT(model="nova-2-phonecall"),
            llm=openai.LLM(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")),
            tts=openai.TTS(voice=os.getenv("OPENAI_TTS_VOICE", "nova")),
        )

    logger.info("Using LiveKit Cloud Inference (unified STT + LLM + TTS via LiveKit keys)")
    return AgentSession(
        vad=silero.VAD.load(),
        stt=os.getenv("LIVEKIT_STT_MODEL", "deepgram/nova-3:multi"),
        llm=os.getenv("LIVEKIT_LLM_MODEL", "openai/gpt-4.1-mini"),
        tts=os.getenv(
            "LIVEKIT_TTS_MODEL",
            "cartesia/sonic-2:6f84f4b8-58a2-430c-8c79-688dad597532",
        ),
    )


async def entrypoint(ctx: JobContext) -> None:
    logger.info("Connecting Nora Receptionist to LiveKit room: %s", ctx.room.name)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    participant = await ctx.wait_for_participant()
    caller_phone = extract_caller_phone(participant)
    logger.info(
        "Participant connected: identity=%s, caller_phone=%s",
        participant.identity,
        caller_phone,
    )

    office_state = await fetch_office_hours_state()
    settings = office_state.get("settings", {})
    status = office_state.get("status", {})

    office_name = settings.get("officeName", "Ori Home Improvement")
    is_after_hours = not status.get("isOpen", False)
    status_reason = status.get("reason", "After office hours")
    greeting = settings.get(
        "afterHoursGreeting",
        f"Thank you for calling {office_name}, Central New Jersey's trusted home remodeling contractor. "
        "Our office is currently closed, but I can summarize your project requirements and check our calendar to book your free estimate right now.",
    )

    tool_ctx = ReceptionistTools(caller_phone=caller_phone)
    instructions = build_receptionist_instructions(
        office_name=office_name,
        caller_phone=caller_phone,
        is_after_hours=is_after_hours,
        office_status_reason=status_reason,
        after_hours_greeting=greeting,
    )

    receptionist_agent = Agent(
        instructions=instructions,
        tools=llm.find_function_tools(tool_ctx),
    )

    session = create_voice_session()
    await session.start(agent=receptionist_agent, room=ctx.room)
    await session.generate_reply(
        instructions=f"Greet the caller warmly right now with: '{greeting}'"
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("LIVEKIT_AGENT_NAME", "nora-receptionist"),
        )
    )
