import {
  Agent,
  AgentSession,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  log,
} from "@livekit/agents";
import { fileURLToPath } from "node:url";

export default defineAgent({
  entry: async (context) => {
    const logger = log();
    const session = new AgentSession({
      stt: new inference.STT({
        model: process.env.LIVEKIT_STT_MODEL || "deepgram/nova-3",
        language: process.env.LIVEKIT_STT_LANGUAGE || "multi",
      }),
      // The room is a transcription service, not a conversational voice bot.
      llm: undefined,
      tts: undefined,
      vad: null,
      turnHandling: {
        turnDetection: "stt",
        interruption: { enabled: false },
        preemptiveGeneration: { enabled: false },
      },
      userAwayTimeout: null,
      transcriptionTimeout: 15_000,
    });

    const agent = Agent.create({
      instructions: "Transcribe the participant's speech verbatim. Preserve the detected language and do not answer.",
      llm: null,
      tts: null,
    });

    context.addShutdownCallback(async () => {
      logger.info({ room: context.room.name, usage: session.usage }, "CivicLens transcriber stopped");
    });

    await session.start({
      agent,
      room: context.room,
      inputOptions: {
        audioEnabled: true,
        textEnabled: false,
        videoEnabled: false,
        closeOnDisconnect: false,
        deleteRoomOnClose: false,
      },
      outputOptions: {
        audioEnabled: false,
        transcriptionEnabled: true,
        syncTranscription: false,
      },
      record: false,
    });

    logger.info({ room: context.room.name }, "CivicLens multilingual transcriber listening");
  },
});

// Named agents are dispatched explicitly by the web app when a Civic Room is
// joined. Keep this value in sync with LIVEKIT_TRANSCRIBER_NAME on Vercel.
cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.LIVEKIT_TRANSCRIBER_NAME || process.env.LIVEKIT_AGENT_NAME || "civiclens-transcriber",
}));
