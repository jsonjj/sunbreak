// Public API surface of ai/npc-personas. Re-exported from index.ts so consumers import
// from "@/systems/ai/npc-personas". `dialogue-ui` primarily uses `startConversation` +
// `useNpcDialogueStore`; peds/interaction use the talkable helpers; wanted/streaming/
// daynight/inventory enrich state via the world-state provider seams.

// Conversation entry points (what dialogue-ui consumes).
export { startConversation, getActiveConversation } from "./conversation";
export { useNpcDialogueStore } from "./store";

// Persona registry (data + tooling).
export {
  getPersona,
  getArchetypePersona,
  listPersonas,
  personaView,
  resolvePersonaForEntity,
  loadPersonaRegistry,
} from "./personaRegistry";
export { PERSONA_CARDS, DEFAULT_PERSONA_ID } from "./personaCards";

// ECS talkable helpers.
export {
  makeTalkable,
  clearTalkable,
  findNearestTalkable,
  talkableEntities,
  isInConversation,
  setInConversation,
  clearInConversation,
} from "./talkable";
export type { TalkableOptions } from "./talkable";

// World-state injection + integration seams.
export {
  collectWorldSnapshot,
  flattenSnapshot,
  registerWorldStateProvider,
  registerDistrictResolver,
} from "./worldState";
export type { WorldStateProvider, DistrictResolver, WorldStateContext } from "./worldState";

// Short-term memory (mostly internal; exposed for tooling / v4 migration).
export { memory, memoryKey } from "./memory";

// Low-level SSE client (advanced consumers / tests).
export { streamDialogue, DialogueTransportError } from "./dialogueClient";

// Config + session.
export {
  configureNpcPersonas,
  getNpcConfig,
  dialogueUrl,
  NPC_DIALOGUE_ENDPOINT,
} from "./config";
export { getSessionId, setSessionId } from "./session";

// Types / the server contract.
export type {
  PersonaCard,
  PersonaView,
  PersonaFewShot,
  NpcArchetype,
  NpcMood,
  WorldSnapshot,
  DialogueTurn,
  DialogueTurnKind,
  NpcConversation,
  NpcConversationState,
  NpcConversationStatus,
  StartConversationOptions,
  DialogueRequest,
  DialogueStreamEvent,
  DialogueSource,
} from "./types";
