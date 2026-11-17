import { NextResponse } from "next/server";
import { AccessToken, RoomServiceClient, AgentDispatchClient } from "livekit-server-sdk";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const callerName = body.callerName || "Web Voice Caller";
  const callerPhone = body.callerPhone || "+14155550199";
  const roomName = body.roomName || `nora-call-${Date.now().toString(36)}`;
  const agentName = process.env.LIVEKIT_AGENT_NAME || "nora-receptionist";

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are not set yet. Create a free LiveKit Cloud account at https://cloud.livekit.io and paste your 3 keys into .env to enable live microphone voice calls!",
      },
      { status: 200 }
    );
  }

  try {
    const httpUrl = wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await roomService.createRoom({ name: roomName, emptyTimeout: 300 }).catch(() => {});

    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient
      .createDispatch(roomName, agentName, {
        metadata: JSON.stringify({
          source: "web-voice-dialer",
          callerPhone,
          callerName,
        }),
      })
      .catch((err) => {
        console.warn("Agent dispatch warning (agent may auto-join if unnamed):", err);
      });
  } catch (err) {
    console.warn("Room/Dispatch setup warning:", err);
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `caller_${Date.now().toString(36)}`,
    name: callerName,
    attributes: {
      "sip.phoneNumber": callerPhone,
      caller_phone: callerPhone,
      caller_name: callerName,
    },
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({
    configured: true,
    token,
    wsUrl,
    roomName,
    agentName,
  });
}
