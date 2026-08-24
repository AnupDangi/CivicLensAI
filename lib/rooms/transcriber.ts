import "server-only";

import { AgentDispatchClient } from "livekit-server-sdk";

const DEFAULT_TRANSCRIBER_AGENT_NAME = "civiclens-transcriber";

/**
 * This name must be the same in the web deployment and the LiveKit worker
 * deployment. Giving the worker a name makes dispatch deterministic instead of
 * relying on LiveKit's unnamed-worker auto-dispatch behaviour.
 */
export function transcriberAgentName() {
  return process.env.LIVEKIT_TRANSCRIBER_NAME?.trim() || DEFAULT_TRANSCRIBER_AGENT_NAME;
}

export async function ensureTranscriberDispatch(roomName: string) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error("LiveKit is not configured.");

  const agentName = transcriberAgentName();
  const client = new AgentDispatchClient(url, apiKey, apiSecret);
  const existing = await client.listDispatch(roomName);
  if (existing.some((dispatch) => dispatch.agentName === agentName)) return { agentName, reused: true };

  try {
    await client.createDispatch(roomName, agentName, { metadata: JSON.stringify({ purpose: "live-transcription" }) });
    return { agentName, reused: false };
  } catch (error) {
    // Two people can open the same persistent room at the same time. Treat the
    // other request winning that race as success, but surface real dispatch errors.
    const afterRace = await client.listDispatch(roomName).catch(() => []);
    if (afterRace.some((dispatch) => dispatch.agentName === agentName)) return { agentName, reused: true };
    throw error;
  }
}
