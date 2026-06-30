// Shared message + state types used by client, server, and the sim.

export type Role = "host" | "guest";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Input {
  move: Vec2; // normalized, magnitude 0..1
  kick: boolean;
}

export const DEFAULT_INPUT: Input = { move: { x: 0, y: 0 }, kick: false };

export type Phase = "waiting" | "countdown" | "playing" | "goal" | "won";

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Player extends Body {
  cd: number; // dash cooldown remaining (s)
  dash: boolean; // dashed this tick (transient, drives ball boost)
}

export interface GameState {
  phase: Phase;
  timer: number; // countdown / goal-pause timer (s)
  ball: Body;
  players: { host: Player; guest: Player };
  score: { host: number; guest: number };
  winner: Role | null;
  scorer: Role | null; // who scored the most recent goal (for celebration)
}

// ---- client <-> server (signaling + relay) ----
export type ClientMsg =
  | { t: "create" }
  | { t: "join"; code: string }
  | { t: "msg"; payload: PeerMsg };

export type ServerMsg =
  | { t: "created"; code: string }
  | { t: "joined" } // -> guest
  | { t: "peer-joined" } // -> host when guest arrives
  | { t: "peer-left" }
  | { t: "peer-msg"; payload: PeerMsg }
  | { t: "error"; msg: string };

// ---- peer <-> peer (relayed via server, or sent over WebRTC datachannel) ----
export type PeerMsg =
  | { t: "input"; input: Input }
  | { t: "snapshot"; state: GameState }
  | { t: "rtc"; data: RtcSignal }
  | { t: "pick"; teamId: string } // guest -> host: requested team
  | { t: "teams"; host: string | null; guest: string | null } // host -> guest: authoritative
  | { t: "rematch" };

export type RtcSignal =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit };
