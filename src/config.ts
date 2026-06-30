// Single source of tuning + branding. Tweak colors/logo to match Huateque CR.

export const BRAND = {
  name: "Huateque",
  tagline: "Mini Fútbol",
  // Placeholder brand colors — swap to match the restaurant logo.
  primary: "#E63A1F",
  accent: "#F4B41A",
  logoPath: "/logo.png", // drop a transparent PNG here (optional)
};

// Selectable teams = Huateque menu items. Players pick one; the two players
// can't share a team. Colors evoke each dish.
export interface TeamDef {
  id: string;
  name: string;
  color: string;
}
export const TEAMS: TeamDef[] = [
  { id: "guacamole", name: "Guacamole", color: "#4CAF50" },
  { id: "tortas", name: "Tortas", color: "#D98E04" },
  { id: "pastor", name: "Tacos Pastor", color: "#E8482B" },
  { id: "varios", name: "Varios", color: "#9B59B6" },
  { id: "campechanos", name: "Campechanos", color: "#8D5524" },
  { id: "sopes", name: "Sopes", color: "#F2C14E" },
  { id: "enchipotladas", name: "Enchipotladas", color: "#B71C1C" },
];
export function teamById(id: string | null): TeamDef | null {
  return TEAMS.find((t) => t.id === id) ?? null;
}

// Fallback identities used before a team is chosen.
export const TEAM = {
  host: { name: "Local", color: "#E63A1F" },
  guest: { name: "Visita", color: "#2E7DF7" },
};

// 2D simulation plane. x = long axis (goals at ±W/2). y = short axis (walls at ±H/2).
export const FIELD = {
  W: 16,
  H: 10,
  goalHalf: 1.9, // half-height of the goal opening
  border: 0.35, // visual wall thickness
};

export const PHYS = {
  tickHz: 30,
  dt: 1 / 30,
  playerRadius: 0.6,
  ballRadius: 0.34,
  playerSpeed: 8.0, // top speed (units/s)
  playerAccel: 55, // approach accel (units/s^2)
  // DASH = movement burst
  dashImpulse: 12.0, // speed added in the dash direction
  dashCooldown: 0.7, // s between dashes
  // KICK = strike the ball
  kickPower: 17.0, // ball speed imparted by a kick
  kickReach: 0.5, // extra distance beyond touching at which a kick connects
  kickCooldown: 0.4, // s between kicks
  ballDamping: 0.55, // ball velocity retained per second (lower = more friction)
  wallRestitution: 0.82,
  hitBase: 3.5, // base ball nudge on plain contact
  hitTransfer: 1.0, // how much player speed transfers to ball
  maxBallSpeed: 32,
};

export const RULES = {
  winGoals: 5,
  goalPause: 1.4, // s freeze after a goal (celebration)
  countdown: 3, // s kickoff countdown
};
