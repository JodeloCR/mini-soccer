// Three.js view: cantina-themed pitch, sombrero players, ball, goals,
// sideline "fan eggs" that bounce (and cheer on goals), plus dash/kick FX.
// Pure presentation — fed a GameState via apply(); animates itself in render().

import * as THREE from "three";
import { BRAND, FIELD, PHYS, TEAM } from "../config";
import type { GameState, Player } from "../net/protocol";

const HW = FIELD.W / 2;
const HH = FIELD.H / 2;

interface PlayerVis {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ringLife: number; // kick FX (1 -> 0)
  squash: number; // dash FX (1 -> 0)
  angle: number; // smoothed facing angle
}

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface Egg {
  group: THREE.Group;
  baseY: number;
  phase: number;
  speed: number;
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private ball!: THREE.Mesh;
  private host!: PlayerVis;
  private guest!: PlayerVis;
  private eggs: Egg[] = [];
  private prevBall = { x: 0, y: 0 };
  private cheerT = 0;
  private last = performance.now();
  // juice state
  private shakeI = 0;
  private fovP = 0;
  private basePos = new THREE.Vector3(0, 15.5, 9.5);
  private ballV = { x: 0, y: 0 };
  private trail: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private trailIdx = 0;
  private parts: Particle[] = [];
  private partIdx = 0;
  // goal celebration
  private confettiPool: Particle[] = [];
  private confettiIdx = 0;
  private goalCamT = 0;
  private goalCamTarget = new THREE.Vector3();
  private nets: Record<"left" | "right", THREE.Mesh | null> = { left: null, right: null };
  private netPulse = { left: 0, right: 0 };

  constructor(private container: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#10241a");
    this.scene.fog = new THREE.Fog("#10241a", 22, 46);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    this.camera.position.set(0, 15.5, 9.5);
    this.camera.lookAt(0, 0, 0);

    this.addLights();
    this.addField();
    this.addGoals();
    this.addEggs();
    this.ball = this.makeBall();
    this.scene.add(this.ball);
    this.host = this.makePlayer(TEAM.host.color, Math.PI / 2); // faces +x
    this.guest = this.makePlayer(TEAM.guest.color, -Math.PI / 2); // faces -x
    this.scene.add(this.host.group, this.guest.group);
    this.makePools();

    this.resize();
    addEventListener("resize", () => this.resize());
  }

  private addLights() {
    this.scene.add(new THREE.AmbientLight(0xffe9c8, 0.6)); // warm fill
    const dir = new THREE.DirectionalLight(0xfff2dd, 1.05);
    dir.position.set(-7, 16, 7);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = 13;
    const c = dir.shadow.camera;
    c.left = -d;
    c.right = d;
    c.top = d;
    c.bottom = -d;
    c.near = 1;
    c.far = 40;
    this.scene.add(dir);
    // warm rim light for the cantina mood
    const warm = new THREE.PointLight(0xff8c3b, 0.5, 40);
    warm.position.set(6, 8, -6);
    this.scene.add(warm);
  }

  private addField() {
    const tex = pitchTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W, FIELD.H), mat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // wooden "table" apron under/around the pitch (restaurant table vibe)
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.W + 3.4, 0.4, FIELD.H + 3.4),
      new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.85 }),
    );
    apron.position.y = -0.22;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // raised border walls (skip the goal openings on the short sides)
    const wallMat = new THREE.MeshStandardMaterial({ color: "#f6efe2", roughness: 0.6 });
    const t = FIELD.border;
    const h = 0.5;
    const longWall = () => new THREE.BoxGeometry(FIELD.W + t * 2, h, t);
    const top = new THREE.Mesh(longWall(), wallMat);
    setPos(top, 0, HH + t / 2, h / 2);
    const bottom = new THREE.Mesh(longWall(), wallMat);
    setPos(bottom, 0, -(HH + t / 2), h / 2);
    top.castShadow = bottom.castShadow = true;
    this.scene.add(top, bottom);

    const segLen = HH - FIELD.goalHalf;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(t, h, segLen), wallMat);
        setPos(seg, sx * (HW + t / 2), sy * (FIELD.goalHalf + segLen / 2), h / 2);
        seg.castShadow = true;
        this.scene.add(seg);
      }
    }

    addLogo(this.scene);
  }

  private addGoals() {
    const postMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 });
    const netMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12 });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 14), postMat);
        setPos(post, sx * HW, sy * FIELD.goalHalf, 0.47);
        post.castShadow = true;
        this.scene.add(post);
      }
      // crossbar-ish top rail
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, FIELD.goalHalf * 2, 12), postMat);
      rail.rotation.x = Math.PI / 2;
      setPos(rail, sx * HW, 0, 0.92);
      this.scene.add(rail);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalf * 2, 0.85), netMat.clone());
      net.rotation.y = Math.PI / 2;
      setPos(net, sx * (HW + 0.45), 0, 0.42);
      this.scene.add(net);
      this.nets[sx === 1 ? "right" : "left"] = net;
    }
  }

  private addEggs() {
    const colors = ["#E8482B", "#F2C14E", "#4CAF50", "#9B59B6", "#2E7DF7"];
    let i = 0;
    const place = (x: number, y: number) => {
      const e = this.makeEgg(colors[i % colors.length]);
      setPos(e.group, x, y, e.baseY);
      this.eggs.push(e);
      this.scene.add(e.group);
      i++;
    };
    const cols = 6;
    for (let c = 0; c < cols; c++) {
      const x = -HW + 1 + (c / (cols - 1)) * (FIELD.W - 2);
      place(x, HH + 1.1); // top sideline
      place(x, -(HH + 1.1)); // bottom sideline
    }
  }

  private makeEgg(somColor: string): Egg {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshStandardMaterial({ color: "#fff3d6", roughness: 0.5 }),
    );
    body.scale.y = 1.4;
    body.position.y = 0.32;
    body.castShadow = true;
    // tiny eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: "#26201a" });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
      eye.position.set(sx * 0.12, 0.42, 0.26);
      g.add(eye);
    }
    const som = makeSombrero(somColor, 0.55);
    som.position.y = 0.6;
    g.add(body, som);
    // phases are deterministic per index via position; jitter from x
    return { group: g, baseY: 0.0, phase: this.eggs.length * 0.9, speed: 2.4 + (this.eggs.length % 3) * 0.4 };
  }

  private makeBall() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(PHYS.ballRadius, 26, 18),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 }),
    );
    ball.castShadow = true;
    const patchMat = new THREE.MeshStandardMaterial({ color: "#161616", roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(PHYS.ballRadius * 0.32, 8, 6), patchMat);
      const a = (i / 8) * Math.PI * 2;
      patch.position.set(
        Math.cos(a) * PHYS.ballRadius * 0.8,
        Math.sin(a * 0.7) * PHYS.ballRadius * 0.6,
        Math.sin(a * 1.7) * PHYS.ballRadius * 0.6,
      );
      ball.add(patch);
    }
    return ball;
  }

  private makePlayer(color: string, initAngle: number): PlayerVis {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(PHYS.playerRadius, PHYS.playerRadius * 0.92, 0.72, 24),
      bodyMat,
    );
    body.position.y = 0.36;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 18, 12),
      new THREE.MeshStandardMaterial({ color: "#e8b98c", roughness: 0.6 }),
    );
    head.position.y = 0.86;
    head.castShadow = true;
    // mustache on the face — shows facing direction + fits the theme
    const stache = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.035, 6, 10, Math.PI),
      new THREE.MeshStandardMaterial({ color: "#2a1a10", roughness: 0.8 }),
    );
    stache.rotation.z = Math.PI; // droop downward
    stache.position.set(0, 0.8, 0.27);
    const som = makeSombrero(color, 1);
    som.position.y = 1.04;
    g.add(body, head, stache, som);
    g.rotation.y = initAngle;

    // ground ring used for the kick FX
    const ringMat = new THREE.MeshBasicMaterial({ color: "#fff0b3", transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(PHYS.playerRadius * 0.9, PHYS.playerRadius * 1.15, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);

    return { group: g, bodyMat, ring, ringMat, ringLife: 0, squash: 0, angle: initAngle };
  }

  /** Fixed pools for ball trail + kick particles (mobile-friendly, no allocs per frame). */
  private makePools() {
    const trailGeo = new THREE.SphereGeometry(0.13, 8, 6);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(trailGeo, mat);
      mesh.visible = false;
      this.trail.push({ mesh, mat, life: 0 });
      this.scene.add(mesh);
    }
    const partGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#ffe08a", transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(partGeo, mat);
      mesh.visible = false;
      this.parts.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0 });
      this.scene.add(mesh);
    }
    // confetti: flat colored quads, double-sided so they flicker while spinning
    const confGeo = new THREE.PlaneGeometry(0.16, 0.09);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(confGeo, mat);
      mesh.visible = false;
      this.confettiPool.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0 });
      this.scene.add(mesh);
    }
  }

  /** Goal celebration: confetti in the scorer's color at their goal, net pulse, goal cam. */
  goalFx(scorer: "host" | "guest") {
    const sx = scorer === "host" ? 1 : -1; // host scores into the +x goal
    const teamColor = (scorer === "host" ? this.host : this.guest).bodyMat.color;
    const palette = [teamColor.getStyle(), "#ffffff", BRAND.accent];
    for (let i = 0; i < 40; i++) {
      const c = this.confettiPool[this.confettiIdx++ % this.confettiPool.length];
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      c.vx = Math.cos(a) * sp - sx * 1.5; // drift back toward the pitch
      c.vz = Math.sin(a) * sp;
      c.vy = 4 + Math.random() * 4;
      c.life = 1.2 + Math.random() * 0.8;
      c.mat.color.set(palette[i % palette.length]);
      c.mesh.position.set(sx * HW * 0.9, 0.5 + Math.random(), (Math.random() - 0.5) * FIELD.goalHalf * 2);
      c.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      c.mesh.visible = true;
    }
    this.netPulse[sx === 1 ? "right" : "left"] = 1;
    this.goalCamTarget.set(sx * HW * 0.55, 0, 0);
    this.goalCamT = 1;
    this.cheer();
  }

  /** Radial burst of sparks at a pitch position (kick contact). */
  private burst(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const p = this.parts[this.partIdx++ % this.parts.length];
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 2 + Math.random() * 2.5;
      p.life = 0.5 + Math.random() * 0.3;
      p.mesh.position.set(x, 0.3, -y);
      p.mesh.visible = true;
    }
  }

  /** Recolor the two players from chosen team colors. */
  setColors(hostColor: string, guestColor: string) {
    this.host.bodyMat.color.set(hostColor);
    this.guest.bodyMat.color.set(guestColor);
  }

  /** Trigger a crowd celebration (eggs jump + spin). */
  cheer() {
    this.cheerT = 1.3;
  }

  /** Camera shake, additive; decays in render(). */
  shake(intensity: number) {
    this.shakeI = Math.min(1, this.shakeI + intensity);
  }

  /** Quick zoom-in punch (fov dip), decays in render(). */
  fovPunch() {
    this.fovP = 1;
  }

  apply(s: GameState) {
    setPos(this.ball, s.ball.x, s.ball.y, PHYS.ballRadius);
    const dx = s.ball.x - this.prevBall.x;
    const dy = s.ball.y - this.prevBall.y;
    if (dx || dy) {
      const k = 1 / PHYS.ballRadius;
      this.ball.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -dx * k * 0.5);
      this.ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -dy * k * 0.5);
    }
    this.prevBall = { x: s.ball.x, y: s.ball.y };
    this.ballV = { x: s.ball.vx, y: s.ball.vy };

    this.applyPlayer(this.host, s.players.host);
    this.applyPlayer(this.guest, s.players.guest);
  }

  private applyPlayer(vis: PlayerVis, p: Player) {
    setPos(vis.group, p.x, p.y, 0);
    if (p.kicking) {
      vis.ringLife = 1;
      this.burst(p.x, p.y);
    }
    if (p.dashing) vis.squash = 1;
    // face movement direction (world +z when angle 0; sim y maps to -z)
    if (Math.hypot(p.vx, p.vy) > 0.8) {
      vis.angle = lerpAngle(vis.angle, Math.atan2(p.vx, -p.vy), 0.22);
      vis.group.rotation.y = vis.angle;
    }
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.cheerT > 0) this.cheerT = Math.max(0, this.cheerT - dt);

    // fan eggs bounce; cheer makes them leap + spin
    const cheer = this.cheerT;
    for (const e of this.eggs) {
      const t = now / 1000;
      const amp = 0.16 + cheer * 0.7;
      e.group.position.y = e.baseY + Math.abs(Math.sin(t * e.speed + e.phase)) * amp;
      e.group.rotation.y += dt * (0.4 + cheer * 6);
    }

    // dash/kick FX decay
    for (const vis of [this.host, this.guest]) {
      if (vis.ringLife > 0) {
        vis.ringLife = Math.max(0, vis.ringLife - dt * 3.2);
        const s = 1 + (1 - vis.ringLife) * 1.6;
        vis.ring.scale.set(s, s, s);
        vis.ringMat.opacity = vis.ringLife * 0.8;
      }
      // squash & stretch on dash
      const q = vis.squash;
      if (q > 0) vis.squash = Math.max(0, q - dt * 4);
      vis.group.scale.set(1 + vis.squash * 0.18, 1 - vis.squash * 0.22, 1 + vis.squash * 0.18);
    }

    // ball trail (only when the ball is fast)
    if (Math.hypot(this.ballV.x, this.ballV.y) > 7) {
      const t = this.trail[this.trailIdx++ % this.trail.length];
      t.mesh.position.copy(this.ball.position);
      t.life = 1;
      t.mesh.visible = true;
    }
    for (const t of this.trail) {
      if (t.life > 0) {
        t.life = Math.max(0, t.life - dt * 2.4);
        t.mat.opacity = t.life * 0.4;
        t.mesh.scale.setScalar(0.35 + t.life * 0.65);
        if (t.life === 0) t.mesh.visible = false;
      }
    }

    // kick spark particles
    for (const p of this.parts) {
      if (p.life > 0) {
        p.life -= dt * 1.7;
        p.vy -= 9 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.z += dt * 5;
        p.mat.opacity = Math.max(0, p.life);
        if (p.life <= 0 || p.mesh.position.y < 0.02) {
          p.life = 0;
          p.mesh.visible = false;
        }
      }
    }

    // confetti physics (light gravity + flutter spin)
    for (const c of this.confettiPool) {
      if (c.life > 0) {
        c.life -= dt;
        c.vy -= 4.5 * dt;
        c.mesh.position.x += c.vx * dt;
        c.mesh.position.y += c.vy * dt;
        c.mesh.position.z += c.vz * dt;
        c.mesh.rotation.x += dt * 6;
        c.mesh.rotation.y += dt * 4;
        c.mat.opacity = Math.min(1, Math.max(0, c.life));
        if (c.life <= 0 || c.mesh.position.y < 0.02) {
          c.life = 0;
          c.mesh.visible = false;
        }
      }
    }

    // net pulse on goal
    for (const side of ["left", "right"] as const) {
      const net = this.nets[side];
      if (net && this.netPulse[side] > 0.001) {
        this.netPulse[side] *= Math.exp(-4 * dt);
        const p = this.netPulse[side];
        net.scale.setScalar(1 + p * 0.3);
        (net.material as THREE.MeshBasicMaterial).opacity = 0.12 + p * 0.35;
      }
    }

    // camera: goal-cam dolly toward the scoring goal, then shake + fov punch
    this.goalCamT = Math.max(0, this.goalCamT - dt / 1.3);
    const k = Math.sin(Math.min(1, this.goalCamT) * Math.PI) * 0.45;
    _camPos.copy(this.basePos);
    _look.set(0, 0, 0);
    if (k > 0.001) {
      _goalPos.set(this.goalCamTarget.x * 0.8, this.basePos.y * 0.55, this.basePos.z * 0.55);
      _camPos.lerp(_goalPos, k);
      _look.lerp(this.goalCamTarget, k);
    }
    this.shakeI *= Math.exp(-6 * dt);
    this.fovP *= Math.exp(-5 * dt);
    const sh = this.shakeI * 0.35;
    this.camera.position.set(
      _camPos.x + (Math.random() - 0.5) * sh,
      _camPos.y + (Math.random() - 0.5) * sh,
      _camPos.z + (Math.random() - 0.5) * sh,
    );
    this.camera.fov = 46 - this.fovP * 5;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(_look);

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const fit = Math.max(1, FIELD.W / FIELD.H / Math.max(0.6, w / h));
    this.basePos.set(0, 15.5 * fit, 9.5 * fit);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }
}

// scratch vectors (avoid per-frame allocation)
const _camPos = new THREE.Vector3();
const _goalPos = new THREE.Vector3();
const _look = new THREE.Vector3();

// shortest-path angle interpolation (avoids spinning the long way around)
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// world mapping: sim (x, y) -> three (x, height, -y)
function setPos(o: THREE.Object3D, x: number, y: number, h: number) {
  o.position.set(x, h, -y);
}

function makeSombrero(bandColor: string, scale: number): THREE.Group {
  const g = new THREE.Group();
  const straw = new THREE.MeshStandardMaterial({ color: "#caa24a", roughness: 0.7 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 22), straw);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.34, 22), straw);
  crown.position.y = 0.18;
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.04, 8, 22),
    new THREE.MeshStandardMaterial({ color: bandColor, roughness: 0.5 }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.06;
  g.add(brim, crown, band);
  g.scale.setScalar(scale);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

function pitchTexture(): THREE.CanvasTexture {
  const px = 64;
  const cv = document.createElement("canvas");
  cv.width = FIELD.W * px;
  cv.height = FIELD.H * px;
  const g = cv.getContext("2d")!;

  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? "#188a3c" : "#1d9745";
    g.fillRect((i * cv.width) / stripes, 0, cv.width / stripes + 1, cv.height);
  }
  // subtle vignette
  const grad = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.2, cv.width / 2, cv.height / 2, cv.height * 0.75);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = grad;
  g.fillRect(0, 0, cv.width, cv.height);

  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 4;
  const m = 0.4 * px;
  g.strokeRect(m, m, cv.width - 2 * m, cv.height - 2 * m);
  g.beginPath();
  g.moveTo(cv.width / 2, m);
  g.lineTo(cv.width / 2, cv.height - m);
  g.stroke();
  g.beginPath();
  g.arc(cv.width / 2, cv.height / 2, 1.7 * px, 0, Math.PI * 2);
  g.stroke();
  // penalty boxes
  const boxW = 1.8 * px;
  const boxH = (FIELD.goalHalf + 1.3) * 2 * px;
  for (const left of [true, false]) {
    const x = left ? m : cv.width - m - boxW;
    g.strokeRect(x, cv.height / 2 - boxH / 2, boxW, boxH);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addLogo(scene: THREE.Scene) {
  const loader = new THREE.TextureLoader();
  loader.load(
    BRAND.logoPath,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // circular medallion: square logo (dark background) reads as a crest
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(0, 0.02, 0);
      scene.add(disc);
      // thin white rim so it sits nicely on the pitch
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(1.25, 1.33, 40),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75 }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(0, 0.021, 0);
      scene.add(rim);
    },
    undefined,
    () => {
      /* no logo file — fine */
    },
  );
}
