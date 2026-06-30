// Three.js view: pitch, goals, ball, two players, lights, slightly-tilted
// top-down camera. Pure presentation — fed a GameState via apply().

import * as THREE from "three";
import { BRAND, FIELD, PHYS, TEAM } from "../config";
import type { GameState } from "../net/protocol";

const HW = FIELD.W / 2;
const HH = FIELD.H / 2;

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private ball!: THREE.Mesh;
  private pHost!: THREE.Group;
  private pGuest!: THREE.Group;
  private hostMat!: THREE.MeshStandardMaterial;
  private guestMat!: THREE.MeshStandardMaterial;
  private prevBall = { x: 0, y: 0 };

  constructor(private container: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a2e17");

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    this.camera.position.set(0, 15.5, 9.5);
    this.camera.lookAt(0, 0, 0);

    this.addLights();
    this.addField();
    this.addGoals();
    this.ball = this.makeBall();
    this.scene.add(this.ball);
    [this.pHost, this.hostMat] = this.makePlayer(TEAM.host.color);
    [this.pGuest, this.guestMat] = this.makePlayer(TEAM.guest.color);
    this.scene.add(this.pHost, this.pGuest);

    this.resize();
    addEventListener("resize", () => this.resize());
  }

  private addLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
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
  }

  private addField() {
    // pitch with painted lines, drawn to a canvas texture
    const tex = pitchTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const geo = new THREE.PlaneGeometry(FIELD.W, FIELD.H);
    const pitch = new THREE.Mesh(geo, mat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // raised border walls (skip the goal openings on the short sides)
    const wallMat = new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.7 });
    const t = FIELD.border;
    const h = 0.5;
    const longWall = () => new THREE.BoxGeometry(FIELD.W + t * 2, h, t);
    const top = new THREE.Mesh(longWall(), wallMat);
    setPos(top, 0, HH + t / 2, h / 2);
    const bottom = new THREE.Mesh(longWall(), wallMat);
    setPos(bottom, 0, -(HH + t / 2), h / 2);
    this.scene.add(top, bottom);

    // side wall segments above/below each goal opening
    const segLen = HH - FIELD.goalHalf;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(t, h, segLen), wallMat);
        setPos(seg, sx * (HW + t / 2), sy * (FIELD.goalHalf + segLen / 2), h / 2);
        this.scene.add(seg);
      }
    }

    addLogo(this.scene);
  }

  private addGoals() {
    const postMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
    const netMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.12,
    });
    for (const sx of [-1, 1]) {
      // two posts at the edges of the opening
      for (const sy of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 12), postMat);
        setPos(post, sx * HW, sy * FIELD.goalHalf, 0.45);
        this.scene.add(post);
      }
      // faint net plane just behind the line
      const net = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalf * 2, 0.8), netMat);
      net.rotation.y = Math.PI / 2;
      setPos(net, sx * (HW + 0.45), 0, 0.4);
      this.scene.add(net);
    }
  }

  private makeBall() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(PHYS.ballRadius, 24, 16),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }),
    );
    ball.castShadow = true;
    // a few dark patches so rotation is visible
    const patchMat = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(PHYS.ballRadius * 0.36, 8, 6), patchMat);
      const a = (i / 5) * Math.PI * 2;
      patch.position.set(
        Math.cos(a) * PHYS.ballRadius * 0.78,
        Math.sin(a) * PHYS.ballRadius * 0.5,
        Math.sin(a * 1.7) * PHYS.ballRadius * 0.6,
      );
      ball.add(patch);
    }
    return ball;
  }

  private makePlayer(color: string): [THREE.Group, THREE.MeshStandardMaterial] {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(PHYS.playerRadius, PHYS.playerRadius * 0.95, 0.7, 24),
      mat,
    );
    body.position.y = 0.35;
    body.castShadow = true;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(PHYS.playerRadius * 0.55, 18, 12),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }),
    );
    top.position.y = 0.78;
    top.castShadow = true;
    g.add(body, top);
    return [g, mat];
  }

  /** Recolor the two players from chosen team colors. */
  setColors(hostColor: string, guestColor: string) {
    this.hostMat.color.set(hostColor);
    this.guestMat.color.set(guestColor);
  }

  apply(s: GameState) {
    setPos(this.ball, s.ball.x, s.ball.y, PHYS.ballRadius);
    // roll the ball based on travel since last frame
    const dx = s.ball.x - this.prevBall.x;
    const dy = s.ball.y - this.prevBall.y;
    if (dx || dy) {
      const k = 1 / PHYS.ballRadius;
      this.ball.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -dx * k * 0.5);
      this.ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -dy * k * 0.5);
    }
    this.prevBall = { x: s.ball.x, y: s.ball.y };

    setPos(this.pHost, s.players.host.x, s.players.host.y, 0);
    setPos(this.pGuest, s.players.guest.x, s.players.guest.y, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // pull the camera back on narrow/portrait screens so the pitch still fits
    const fit = Math.max(1, (FIELD.W / FIELD.H) / Math.max(0.6, w / h));
    this.camera.position.set(0, 15.5 * fit, 9.5 * fit);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }
}

// world mapping: sim (x, y) -> three (x, height, -y)
function setPos(o: THREE.Object3D, x: number, y: number, h: number) {
  o.position.set(x, h, -y);
}

function pitchTexture(): THREE.CanvasTexture {
  const px = 64; // px per world unit
  const cv = document.createElement("canvas");
  cv.width = FIELD.W * px;
  cv.height = FIELD.H * px;
  const g = cv.getContext("2d")!;

  // mowed stripes
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? "#157d35" : "#1a8a3f";
    g.fillRect((i * cv.width) / stripes, 0, cv.width / stripes + 1, cv.height);
  }

  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 4;
  const m = 0.4 * px;
  g.strokeRect(m, m, cv.width - 2 * m, cv.height - 2 * m);
  // halfway line
  g.beginPath();
  g.moveTo(cv.width / 2, m);
  g.lineTo(cv.width / 2, cv.height - m);
  g.stroke();
  // center circle
  g.beginPath();
  g.arc(cv.width / 2, cv.height / 2, 1.7 * px, 0, Math.PI * 2);
  g.stroke();

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
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(0, 0.02, 0);
      scene.add(plane);
    },
    undefined,
    () => {
      /* no logo file — center circle stays bare, that's fine */
    },
  );
}
