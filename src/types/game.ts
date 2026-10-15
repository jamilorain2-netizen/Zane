export type SceneLocation = 'bedroom' | 'house_map' | 'battlefield';

export interface InteractionNode {
  id: string;
  name: string;
  position: [number, number, number];
  promptKey: string; // e.g. "E"
  promptVerb: string; // e.g. "View", "Open", "Look", "Exit", "Inspect", "Examine"
  interactRadius: number;
  description: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  effect: () => void;
  outcomeText: string;
  telltaleNotification?: string;
}

export interface ActiveCinematicShot {
  title: string;
  subtitle: string;
  cameraPos: [number, number, number];
  cameraLookAt: [number, number, number];
  duration: number; // in seconds
  speaker?: 'Zane' | 'Dad' | 'Narrator' | 'Corporate Broadcast';
  quote?: string;
}

export interface GameNotification {
  id: string;
  text: string;
  timestamp: number;
}

export type QuestId = 'get_wrench' | 'hallway_pictures' | 'kitchen_key' | 'basement_wrench' | 'deliver_wrench' | 'kitchen_beer';
export type QuestStatus = 'inactive' | 'active' | 'completed';

export interface StoryState {
  completedCutscenes: Record<string, boolean>;
  quests: {
    get_wrench: QuestStatus;
    hallway_pictures: QuestStatus;
    kitchen_key: QuestStatus;
    basement_wrench: QuestStatus;
    deliver_wrench: QuestStatus;
    kitchen_beer: QuestStatus;
  };
  triggeredZones: Record<string, boolean>;
  openingPlayed: boolean;
  hasKey: boolean;
  hasWrench: boolean;
  hasFlashlight: boolean;
  hasPower?: boolean;
  photoChoice?: 'taken' | 'left';
  beerReply?: 'Not beer again, Dad' | '...' | string;
}

export interface MobileInputState {
  movement: { x: number; y: number }; // -1 to 1 for joystick
  look: { x: number; y: number }; // delta for look
  jump: boolean;
  interact: boolean;
}
