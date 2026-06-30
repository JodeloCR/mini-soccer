// Single source of tuning + branding. Tweak colors/logo to match Huateque CR.

export const BRAND = {
  name: "Huateque",
  tagline: "Mini Fútbol",
  // Placeholder brand colors — swap to match the restaurant logo.
  primary: "#E63A1F",
  accent: "#F4B41A",
  logoPath: "/logo.png", // drop a transparent PNG here (optional)
};

// Team identities (host = the phone that starts the match).
export const TEAM = {
  host: { name: "Rojo", color: "#E63A1F" },
  guest: { name: "Azul", color: "#2E7DF7" },
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
  kickImpulse: 9.0, // dash speed added to player
  kickCooldown: 0.45, // s between dashes
  ballDamping: 0.55, // ball velocity retained per second (lower = more friction)
  wallRestitution: 0.82,
  hitBase: 4.0, // base ball nudge on any contact
  hitTransfer: 1.0, // how much player speed transfers to ball
  ballKickBoost: 7.0, // extra ball speed when contact happens during a dash
  maxBallSpeed: 26,
};

export const RULES = {
  winGoals: 5,
  goalPause: 1.4, // s freeze after a goal (celebration)
  countdown: 3, // s kickoff countdown
};
