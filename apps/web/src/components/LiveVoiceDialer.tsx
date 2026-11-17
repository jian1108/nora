"use client";

import React, { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  BarVisualizer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { PhoneCall, PhoneOff, Mic, Radio, AlertTriangle } from "lucide-react";

function ActiveVoiceStage({
  callerPhone,
  onHangup,
}: {
  callerPhone: string;
  onHangup: () => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className="p-6 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-5 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
        <Radio className="w-3.5 h-3.5 animate-pulse" />
        Live WebRTC Voice Call Active • Agent Status: {state.toUpperCase()}
      </div>

      <div className="h-28 flex items-center justify-center bg-slate-900/90 rounded-xl border border-slate-800 px-6">
        <BarVisualizer
          state={state}
          barCount={15}
          trackRef={audioTrack}
          className="h-20 w-full"
        />
      </div>

      <p className="text-xs text-slate-300 max-w-md mx-auto">
        Speak into your microphone! Ask Nora to take a message or check the
        calendar to book an appointment for <strong>{callerPhone}</strong>.
      </p>

      <div className="flex items-center justify-center gap-3 pt-2">
        <VoiceAssistantControlBar controls={{ leave: false }} />
        <button
          onClick={onHangup}
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 transition"
        >
          <PhoneOff className="w-4 h-4" />
          End Call
        </button>
      </div>
    </div>
  );
}

export function LiveVoiceDialer({
  defaultCallerName,
  defaultCallerPhone,
  onCallEnded,
}: {
  defaultCallerName: string;
  defaultCallerPhone: string;
  onCallEnded: () => void;
}) {
  const [callerName, setCallerName] = useState(defaultCallerName);
  const [callerPhone, setCallerPhone] = useState(defaultCallerPhone);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState<{
    token: string;
    wsUrl: string;
    roomName: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function startLiveVoiceCall() {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/livekit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerName, callerPhone }),
      });
      const data = await res.json();
      if (!data.configured) {
        setErrorMsg(data.error);
      } else {
        setSession({
          token: data.token,
          wsUrl: data.wsUrl,
          roomName: data.roomName,
        });
      }
    } catch (e) {
      setErrorMsg(`Failed to connect to /api/livekit: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setSession(null);
    onCallEnded();
  }

  return (
    <div className="p-6 rounded-xl bg-[#111827] border border-indigo-500/40 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400">
            Real-Time Microphone Call (LiveKit WebRTC)
          </span>
          <h2 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
            <Mic className="w-4 h-4 text-emerald-400" />
            Talk to Nora Live in Your Browser
          </h2>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Connects your computer microphone directly to your running{" "}
        <code className="text-indigo-300">apps/agent/agent.py</code> worker via
        LiveKit Cloud — using the exact same voice pipeline and tools as a phone
        call to your LiveKit Phone Number.
      </p>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {!session ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={callerName}
                onChange={(e) => setCallerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Simulated Caller ID (`sip.phoneNumber`)
              </label>
              <input
                type="text"
                value={callerPhone}
                onChange={(e) => setCallerPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono"
              />
            </div>
          </div>

          <button
            onClick={startLiveVoiceCall}
            disabled={connecting}
            className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
          >
            <PhoneCall className="w-4 h-4" />
            {connecting
              ? "Dialing Nora LiveKit Room..."
              : "Start Live Microphone Call with Nora"}
          </button>
        </div>
      ) : (
        <LiveKitRoom
          serverUrl={session.wsUrl}
          token={session.token}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={handleDisconnect}
        >
          <RoomAudioRenderer />
          <ActiveVoiceStage
            callerPhone={callerPhone}
            onHangup={handleDisconnect}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}

