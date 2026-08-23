"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TranscriptionSegment,
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
type LiveTranscript = {
  id: string;
  text: string;
  language: string;
  final: boolean;
  participant: string;
};

const FINISHED_STAGES = ["COMPLETE", "PARTIAL", "FAILED"];
const LIVE_REFRESH_MS = 120_000;

function applyPlayerCommand(frame: HTMLIFrameElement | null, command: PlaybackCommand, args: (number | boolean)[]) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args }), "https://www.youtube.com");
}

export function CivicRoom({ videoId, initialAnalysisId }: { videoId: string; initialAnalysisId?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const liveRoom = useRef<Room | undefined>(undefined);
  const sharedTracks = useRef<LocalTrack[]>([]);
  const stoppingShare = useRef(false);
  const [status, setStatus] = useState<RoomStatus>({ configured: false, message: "Opening room preview…" });
  const [participants, setParticipants] = useState<string[]>([]);
  const [tab, setTab] = useState<"FACTS" | "TRANSCRIPT" | "DISCUSS">("FACTS");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", author: "CivicLens", body: "This discussion is temporary. Share evidence, not personal information." },
  ]);
  const [draftBody, setDraftBody] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisRecord>();
  const [analysisMessage, setAnalysisMessage] = useState("Starting automatic transcript and evidence analysis…");
  const [comments, setComments] = useState<Comment[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);

  const upsertTranscript = useCallback((segment: LiveTranscript) => {
    setLiveTranscripts((current) => {
      const existing = current.findIndex((item) => item.id === segment.id);
      if (existing < 0) return [...current, segment].slice(-100);
      const next = [...current];
      next[existing] = segment;
      return next;
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const stageOnMount = videoStageRef.current;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    liveRoom.current = room;
    const syncParticipants = () => setParticipants([...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity));
    const attachRemoteTrack = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (!videoStageRef.current) return;
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach() as HTMLAudioElement;
        element.autoplay = true;
        element.dataset.trackSid = publication.trackSid;
        videoStageRef.current.append(element);
        return;
      }
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
    const detachRemoteTrack = (track: RemoteTrack, publication: RemoteTrackPublication) => {
      track.detach().forEach((element) => element.remove());
      videoStageRef.current?.querySelector(`[data-track-sid="${publication.trackSid}"]`)?.remove();
    };
    const onLegacyTranscription = (segments: TranscriptionSegment[], participant?: Participant) => {
      for (const segment of segments) {
        upsertTranscript({
          id: segment.id,
          text: segment.text,
          language: segment.language || "und",
          final: segment.final,
          participant: participant?.name || participant?.identity || "Room audio",
        });
      }
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
    room.on(RoomEvent.TrackSubscribed, attachRemoteTrack);
    room.on(RoomEvent.TrackUnsubscribed, detachRemoteTrack);
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.TranscriptionReceived, onLegacyTranscription);
    room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const attributes = reader.info.attributes ?? {};
      const id = attributes["lk.segment_id"] || reader.info.id;
      const final = attributes["lk.transcription_final"] === "true";
      for await (const text of reader) {
        if (!mounted || !text.trim()) continue;
        upsertTranscript({ id, text, language: attributes["lk.transcription_language"] || "und", final, participant: participantInfo.identity });
      }
    });

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
      sharedTracks.current.forEach((track) => track.stop());
      sharedTracks.current = [];
      room.disconnect();
    };
  }, [upsertTranscript, videoId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/comments?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { comments: [] })
      .then((data) => {
        if (active) setComments(data.comments ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
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
        body: JSON.stringify({ videoId, body }),
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

  function commandPlayer(command: PlaybackCommand, args: (number | boolean)[] = []) {
    applyPlayerCommand(iframeRef.current, command, args);
  }

  function attachLocalVideo(track: LocalTrack, owner: "camera" | "screen") {
    const stage = videoStageRef.current;
    if (!stage || track.kind !== Track.Kind.Video) return;
    stage.querySelector(`[data-video-owner="local-${owner}"]`)?.remove();
    const tile = document.createElement("div");
    tile.className = `video-tile ${owner === "screen" ? "screen-tile" : ""}`;
    tile.dataset.videoOwner = `local-${owner}`;
    const element = track.attach() as HTMLVideoElement;
    element.muted = true;
    element.autoplay = true;
    element.playsInline = true;
    tile.append(element);
    const label = document.createElement("span");
    label.textContent = `${status.displayName || "You"} · ${owner}`;
    tile.append(label);
    stage.append(tile);
  }

  async function toggleMic() {
    const room = liveRoom.current;
    if (!room || !status.configured || screenSharing) return;
    try {
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(!mic);
      setMic(!mic);
    } catch {
      setStatus((current) => ({ ...current, message: "Microphone permission was not granted." }));
    }
  }

  async function toggleCamera() {
    const room = liveRoom.current;
    if (!room || !status.configured) return;
    try {
      await room.localParticipant.setCameraEnabled(!camera);
      setCamera(!camera);
      videoStageRef.current?.querySelector('[data-video-owner="local-camera"]')?.remove();
      if (!camera) {
        const publication = [...room.localParticipant.videoTrackPublications.values()]
          .find((item) => item.source === Track.Source.Camera && item.track);
        if (publication?.track) attachLocalVideo(publication.track, "camera");
      }
    } catch {
      setStatus((current) => ({ ...current, message: "Camera permission was not granted." }));
    }
  }

  async function stopScreenShare() {
    if (stoppingShare.current) return;
    stoppingShare.current = true;
    const room = liveRoom.current;
    const tracks = sharedTracks.current;
    sharedTracks.current = [];
    try {
      for (const track of tracks) {
        if (room) await room.localParticipant.unpublishTrack(track).catch(() => undefined);
        track.detach().forEach((element) => element.remove());
        track.stop();
      }
    } finally {
      videoStageRef.current?.querySelector('[data-video-owner="local-screen"]')?.remove();
      setScreenSharing(false);
      stoppingShare.current = false;
    }
  }

  async function toggleScreenShare() {
    const room = liveRoom.current;
    if (!room || !status.configured) return;
    if (screenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      await room.startAudio();
      if (mic) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMic(false);
      }
      const tracks = await room.localParticipant.createScreenTracks({
        audio: true,
        video: { displaySurface: "browser" },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
        contentHint: "motion",
      });
      sharedTracks.current = tracks;
      for (const track of tracks) {
        // The transcriber listens to the participant's microphone source. Publishing
        // shared tab audio on that source lets it transcribe the video audio live.
        const source = track.kind === Track.Kind.Video ? Track.Source.ScreenShare : Track.Source.Microphone;
        await room.localParticipant.publishTrack(track, { source });
        if (track.kind === Track.Kind.Video) attachLocalVideo(track, "screen");
        track.once(TrackEvent.Ended, () => void stopScreenShare());
      }
      setScreenSharing(true);
      setTab("TRANSCRIPT");
      setStatus((current) => ({ ...current, message: "Sharing the selected tab. Keep ‘Share tab audio’ enabled for live transcription." }));
    } catch (error) {
      await stopScreenShare();
      setStatus((current) => ({ ...current, message: error instanceof Error ? error.message : "Screen sharing was not granted." }));
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
          <button className={`toolbar-button ${mic ? "active" : ""}`} onClick={toggleMic} disabled={!status.configured || screenSharing}>{mic ? "● Mic live" : "◉ Join voice"}</button>
          <button className={`toolbar-button ${camera ? "active" : ""}`} onClick={toggleCamera} disabled={!status.configured}>{camera ? "■ Camera on" : "▣ Camera off"}</button>
          <button className={`toolbar-button ${screenSharing ? "active" : ""}`} onClick={toggleScreenShare} disabled={!status.configured}>{screenSharing ? "■ Stop sharing" : "▤ Share video + audio"}</button>
          <button className="toolbar-button" onClick={() => navigator.clipboard.writeText(location.href)}>↗ Share room</button>
          <a className="toolbar-button" href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">↗ Open source</a>
        </div>
        <div className="panel-pad room-summary">
          <div><span className="eyebrow">YouTube civic room</span><h1 className="analysis-title">Watch together. Check the record.</h1></div>
          <div className="room-live-status"><span className="status-dot"/><strong>Automatic language detection</strong><small>{analysisMessage}</small></div>
          <p className="source-url">{status.message}. Camera is off by default. For a YouTube live transcript, share its browser tab and enable “Share tab audio”.</p>
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
            <div className="transcript-heading"><div><p className="fact-label">Detected automatically</p><strong>{analysis?.result?.detectedLanguages.filter((language) => language !== "und").join(" · ") || "Automatic multilingual transcription"}</strong></div><span>{liveTranscripts.length} live · {transcriptArtifacts.length} source</span></div>
            {liveTranscripts.length > 0 && <article className="transcript-block live-transcript"><small><span className="status-dot"/> LiveKit room transcription</small><div className="live-transcript-lines">{liveTranscripts.map((segment) => <p className={segment.final ? "final" : "interim"} key={segment.id}><strong>{segment.participant}</strong>{segment.text}</p>)}</div></article>}
            {transcriptArtifacts.map((artifact, index) => <article className="transcript-block" key={`${artifact.kind}-${index}`}><small>{artifact.extractionMethod} · {artifact.originalLanguage}</small><pre>{artifact.originalText}</pre></article>)}
            {!liveTranscripts.length && !transcriptArtifacts.length
              ? <div className="empty-state"><strong>Waiting for room audio</strong>Use “Share video + audio”, choose the YouTube browser tab, and enable “Share tab audio”. The server transcriber will detect the language automatically.</div>
              : null}
          </>}
          {tab === "DISCUSS" && <>
            {messages.map((message) => (
              <div className="chat-message" key={message.id}>
                <strong>{message.author}</strong>
                <p>{message.body}</p>
              </div>
            ))}
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
