import {
  AutoSubscribe,
  cli,
  defineAgent,
  inference,
  log,
  shortuuid,
  stt,
  ServerOptions,
} from "@livekit/agents";
import { AudioStream, RoomEvent, TrackSource } from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";

const isSharedTabAudio = (publication) => publication.source === TrackSource.SOURCE_SCREENSHARE_AUDIO;

export default defineAgent({
  entry: async (context) => {
    const logger = log();
    const activeTracks = new Map();
    const recognizer = new inference.STT({
      model: process.env.LIVEKIT_STT_MODEL || "deepgram/nova-3",
      language: process.env.LIVEKIT_STT_LANGUAGE || "multi",
    });

    const stopTrack = (trackSid) => {
      activeTracks.get(trackSid)?.close();
      activeTracks.delete(trackSid);
    };

    const transcribeSharedTab = (track, publication, participant) => {
      const trackSid = publication.sid;
      if (!trackSid || !isSharedTabAudio(publication) || activeTracks.has(trackSid)) return;

      const speech = recognizer.stream();
      activeTracks.set(trackSid, speech);
      let segmentId = shortuuid("SG_");

      const publish = async () => {
        try {
          for await (const event of speech) {
            const isTranscript = event.type === stt.SpeechEventType.INTERIM_TRANSCRIPT || event.type === stt.SpeechEventType.FINAL_TRANSCRIPT;
            if (!isTranscript) continue;
            const alternative = event.alternatives?.[0];
            if (!alternative?.text.trim() || !context.room.localParticipant) continue;
            const final = event.type === stt.SpeechEventType.FINAL_TRANSCRIPT;
            await context.room.localParticipant.publishTranscription({
              participantIdentity: participant.identity,
              trackSid,
              segments: [{
                id: segmentId,
                text: alternative.text,
                language: alternative.language || "und",
                final,
                startTime: BigInt(0),
                endTime: BigInt(0),
              }],
            });
            if (final) segmentId = shortuuid("SG_");
          }
        } catch (error) {
          logger.error({ error, trackSid }, "CivicLens shared-tab transcription failed");
        } finally {
          activeTracks.delete(trackSid);
        }
      };

      const feed = async () => {
        try {
          for await (const frame of new AudioStream(track, { sampleRate: 48_000, numChannels: 1 })) speech.pushFrame(frame);
        } catch (error) {
          logger.warn({ error, trackSid }, "CivicLens shared-tab audio stream ended");
        } finally {
          speech.endInput();
        }
      };

      void Promise.all([publish(), feed()]);
      logger.info({ room: context.room.name, participant: participant.identity, trackSid }, "CivicLens transcribing shared tab audio");
    };

    // Never subscribe to meeting microphones. Only explicitly shared tab audio
    // reaches the speech service, so participant conversation stays private.
    await context.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);
    const subscribeToSharedTab = (publication) => {
      if (isSharedTabAudio(publication)) publication.setSubscribed(true);
    };
    context.room.on(RoomEvent.TrackPublished, subscribeToSharedTab);
    context.room.on(RoomEvent.TrackSubscribed, transcribeSharedTab);
    context.room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
      if (publication.sid) stopTrack(publication.sid);
    });
    for (const participant of context.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) subscribeToSharedTab(publication);
    }

    context.addShutdownCallback(async () => {
      for (const trackSid of activeTracks.keys()) stopTrack(trackSid);
      await recognizer.close();
      logger.info({ room: context.room.name }, "CivicLens transcriber stopped");
    });
  },
});

// Named agents are dispatched explicitly by the web app when a Civic Room is
// joined. Keep this value in sync with LIVEKIT_TRANSCRIBER_NAME on Vercel.
cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.LIVEKIT_TRANSCRIBER_NAME || process.env.LIVEKIT_AGENT_NAME || "civiclens-transcriber",
}));
