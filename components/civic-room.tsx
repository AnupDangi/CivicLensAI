"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { AppHeader } from "@/components/app-header";
import { FactCard } from "@/components/fact-card";
import { ManualFallback } from "@/components/manual-fallback";
import { browserUuid } from "@/lib/client-id";
import type { AnalysisRecord } from "@/lib/domain";

type RoomStatus = { configured: boolean; role?: "HOST" | "PARTICIPANT"; displayName?: string; message: string };
type ChatMessage = { id: string; author: string; body: string };
type PlaybackCommand = "playVideo" | "pauseVideo" | "seekTo";
type Packet =
  | { type: "chat"; author: string; body: string }
  | { type: "playback"; command: PlaybackCommand; args: (number | boolean)[] };

type Comment = { id: string; author: string; body: string; isAnonymous: boolean; createdAt: string };

const FINISHED_STAGES = ["COMPLETE", "PARTIAL", "FAILED"];
const LIVE_REFRESH_MS = 120_000;

function applyPlayerCommand(frame: HTMLIFrameElement | null, command: PlaybackCommand, args: (number | boolean)[]) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args }), "https://www.youtube.com");
}

export function CivicRoom({ videoId, initialAnalysisId }: { videoId: string; initialAnalysisId?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const liveRoom = useRef<Room | undefined>(undefined);
  const [status, setStatus] = useState<RoomStatus>({ configured: false, message: "Opening room preview…" });
  const [participants, setParticipants] = useState<string[]>([]);
  const [tab, setTab] = useState<"FACTS" | "TRANSCRIPT" | "DISCUSS">("FACTS");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", author: "CivicLens", body: "This discussion is temporary. Share evidence, not personal information." },
  ]);
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisRecord>();
  const [analysisMessage, setAnalysisMessage] = useState("Starting automatic transcript and evidence analysis…");
  const [comments, setComments] = useState<Comment[]>([]);
  const [draftBody, setDraftBody] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const stageOnMount = videoStageRef.current;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    liveRoom.current = room;
    const syncParticipants = () => setParticipants([...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity));
    const attachRemoteVideo = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Video || !videoStageRef.current) return;
      const tile = document.createElement("div");
      tile.className = "video-tile";
      tile.dataset.trackSid = publication.trackSid;
      const element = track.attach() as HTMLVideoElement;
      element.autoplay = true;
      element.playsInline = true;
      tile.append(element);
      const label = document.createElement("span");
      label.textContent = participant.name || participant.identity;
      tile.append(label);
      videoStageRef.current.append(tile);
    };
    const detachRemoteVideo = (_track: RemoteTrack, publication: RemoteTrackPublication) => {
      videoStageRef.current?.querySelector(`[data-track-sid="${publication.trackSid}"]`)?.remove();
    };
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      try {
        const packet = JSON.parse(new TextDecoder().decode(payload)) as Packet;
        if (topic === "civic.chat" && packet.type === "chat") {
          setMessages((current) => [...current, { id: browserUuid(), author: participant?.name || packet.author, body: packet.body }]);
        }
        if (topic === "civic.playback" && packet.type === "playback") applyPlayerCommand(iframeRef.current, packet.command, packet.args);
      } catch {
        // Ignore malformed room data packets.
      }
    };
    room.on(RoomEvent.ParticipantConnected, syncParticipants);
    room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
    room.on(RoomEvent.TrackSubscribed, attachRemoteVideo);
    room.on(RoomEvent.TrackUnsubscribed, detachRemoteVideo);
    room.on(RoomEvent.DataReceived, onData);

    async function connect() {
      let visitorId = localStorage.getItem("civiclens.visitorId");
      if (!visitorId) {
        visitorId = browserUuid();
        localStorage.setItem("civiclens.visitorId", visitorId);
      }
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, visitorId }),
      });
      const data = await response.json();
      if (!mounted) return;
      if (!response.ok) {
        setStatus({ configured: false, message: data.error || "Room preview only." });
        return;
      }
      await room.connect(data.url, data.token);
      if (!mounted) return;
      setStatus({
        configured: true,
        role: data.role,
        displayName: data.displayName,
        message: `${data.reused ? "Rejoined existing room" : "Created room"} as ${data.displayName}`,
      });
      syncParticipants();
    }
    connect().catch((error) => setStatus({ configured: false, message: error instanceof Error ? error.message : "Room preview only." }));
    return () => {
      mounted = false;
      stageOnMount?.replaceChildren();
      room.disconnect();
    };
  }, [videoId]);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout>;
    let refreshTimer: ReturnType<typeof setTimeout>;

    async function poll(id: string) {
      const response = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the live analysis.");
      if (!active) return;
      setAnalysis(data);
      setAnalysisMessage(data.stage === "FAILED"
        ? `Live pass failed: ${data.failureReason || "the analysis provider is unavailable"}. CivicLens will retry in two minutes.`
        : FINISHED_STAGES.includes(data.stage)
        ? "Live pass complete. CivicLens will check for newer captions in two minutes."
        : `${data.stage.replaceAll("_", " ").toLowerCase()} · ${data.progress}%`);
      if (FINISHED_STAGES.includes(data.stage)) {
        refreshTimer = setTimeout(() => {
          if (document.visibilityState === "visible") void start(true);
        }, LIVE_REFRESH_MS);
      } else {
        pollTimer = setTimeout(() => void poll(id), 2_000);
      }
    }

    async function start(refresh = false) {
      try {
        setAnalysisMessage(refresh ? "Checking for new live captions…" : "Starting automatic transcript and evidence analysis…");
        const response = await fetch("/api/analyses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, refresh }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not start the live analysis.");
        if (active) await poll(data.analysisId);
      } catch (error) {
        if (active) setAnalysisMessage(error instanceof Error ? error.message : "Live analysis is temporarily unavailable.");
      }
    }

    if (initialAnalysisId) void poll(initialAnalysisId).catch(() => void start(false));
    else void start(false);
    return () => {
      active = false;
      clearTimeout(pollTimer);
      clearTimeout(refreshTimer);
    };
  }, [initialAnalysisId, videoId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const body = draftBody.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: browserUuid(), author: "You", body }]);
    setDraftBody("");
    setIsPosting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: videoId, body }),
      });
      const json = await res.json();
      if (json.comment) {
        setComments((current) => [json.comment, ...current]);
      }
    } catch (error) {
      console.error("Comment submit error:", error);
    } finally {
      setIsPosting(false);
    }
  }

  const canControl = status.role === "HOST" || !status.configured;
  const transcriptArtifacts = analysis?.result?.artifacts.filter((artifact) => artifact.originalText && ["AUDIO", "VIDEO", "TEXT"].includes(artifact.kind)) || [];

  return <div className="app-shell">
    <AppHeader label={status.configured ? `${participants.length + 1} in room` : "Room preview"}/>
    <main className="shell room-layout">
      <section className="panel room-stage-panel">
        <div className="video-wrap">
          <iframe ref={iframeRef} src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&playsinline=1&rel=0`} title="Shared YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
          <div className="participant-videos" ref={videoStageRef}/>
          <span className="video-badge">{status.role === "HOST" ? "HOST CONTROLS" : "CIVIC ROOM"}</span>
          <span className="live-analysis-badge"><span/> AUTO CHECKING</span>
        </div>
        <div className="room-toolbar">
          <button className="toolbar-button" onClick={() => commandPlayer("playVideo")} disabled={!canControl}>▶ Play</button>
          <button className="toolbar-button" onClick={() => commandPlayer("pauseVideo")} disabled={!canControl}>Ⅱ Pause</button>
          <button className={`toolbar-button ${mic ? "active" : ""}`} onClick={toggleMic} disabled={!status.configured}>{mic ? "● Mic live" : "◉ Join voice"}</button>
          <button className={`toolbar-button ${camera ? "active" : ""}`} onClick={toggleCamera} disabled={!status.configured}>{camera ? "■ Camera on" : "▣ Camera off"}</button>
          <button className="toolbar-button" onClick={() => navigator.clipboard.writeText(location.href)}>↗ Share room</button>
          <a className="toolbar-button" href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">↗ Open source</a>
        </div>
        <div className="panel-pad room-summary">
          <div><span className="eyebrow">YouTube civic room</span><h1 className="analysis-title">Watch together. Check the record.</h1></div>
          <div className="room-live-status"><span className="status-dot"/><strong>Automatic language detection</strong><small>{analysisMessage}</small></div>
          <p className="source-url">{status.message}. Camera is off by default.</p>
        </div>
      </section>
      <aside className="panel room-inspector">
        <div className="room-tabs">
          <button className={`room-tab ${tab === "FACTS" ? "active" : ""}`} onClick={() => setTab("FACTS")}>FACTS</button>
          <button className={`room-tab ${tab === "TRANSCRIPT" ? "active" : ""}`} onClick={() => setTab("TRANSCRIPT")}>TRANSCRIPT</button>
          <button className={`room-tab ${tab === "DISCUSS" ? "active" : ""}`} onClick={() => setTab("DISCUSS")}>DISCUSS</button>
        </div>
        <div className="room-feed">
          {tab === "FACTS" && <>
            <div className="live-pipeline"><span className={analysis && FINISHED_STAGES.includes(analysis.stage) ? "complete" : "running"}/><div><strong>Live evidence pipeline</strong><small>{analysisMessage}</small></div></div>
            {analysis?.result?.claims.length
              ? <div className="room-facts">{analysis.result.claims.map((claim) => <FactCard claim={claim} key={claim.id}/>)}</div>
              : <div className="empty-state compact"><strong>Listening for checkable claims</strong>Captions are detected automatically. Claims appear here only after evidence retrieval.</div>}
            <div className="manual-check"><p className="fact-label">Priority check</p><ManualFallback/></div>
          </>}
          {tab === "TRANSCRIPT" && <>
            <div className="transcript-heading"><div><p className="fact-label">Detected automatically</p><strong>{analysis?.result?.detectedLanguages.filter((language) => language !== "und").join(" · ") || "Waiting for caption language"}</strong></div><span>{transcriptArtifacts.length} layer{transcriptArtifacts.length === 1 ? "" : "s"}</span></div>
            {transcriptArtifacts.length
              ? transcriptArtifacts.map((artifact, index) => <article className="transcript-block" key={`${artifact.kind}-${index}`}><small>{artifact.extractionMethod} · {artifact.originalLanguage}</small><pre>{artifact.originalText}</pre></article>)
              : <div className="empty-state"><strong>Waiting for captions</strong>CivicLens retries public captions every two minutes while this room is open.</div>}
          </>}
          {tab === "DISCUSS" && <>
            {comments.map((comment) => (
              <div className="chat-message" key={comment.id}>
                <strong>{comment.author}</strong>
                <p>{comment.body}</p>
              </div>
            ))}
            <p className="fact-label participants-label">Participants</p>
            <div className="participant-row"><span className="avatar">YOU</span>{status.displayName || "Preview visitor"}</div>
            {participants.map((participant) => <div className="participant-row" key={participant}><span className="avatar">{participant.slice(-2).toUpperCase()}</span>{participant}</div>)}
            <form className="chat-form" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="chat-message">Message</label>
              <input
                id="chat-message"
                placeholder="Share context or a source…"
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
              />
              <button className="primary-button chat-submit" disabled={isPosting}>
                {isPosting ? "Sending..." : "Send"}
              </button>
            </form>
          </>}
        </div>
      </aside>
    </main>
  </div>;
}
