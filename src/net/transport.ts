// Connection layer. Always connects via WebSocket (signaling + relay) so the
// game is playable immediately. In parallel it tries to open a WebRTC
// DataChannel; if that succeeds, gameplay traffic moves to the direct P2P
// channel. If it fails, we stay on the relay — the game never breaks.

import type { ClientMsg, PeerMsg, Role, RtcSignal, ServerMsg } from "./protocol";

export type TransportKind = "relay" | "p2p";

interface Handlers {
  onRole?: (role: Role, code: string) => void;
  onPeerJoined?: () => void;
  onPeerLeft?: () => void;
  onPeerMsg?: (m: PeerMsg) => void;
  onError?: (msg: string) => void;
  onTransport?: (kind: TransportKind) => void;
}

export class Transport {
  role: Role = "host";
  code = "";
  private ws!: WebSocket;
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private p2p = false;
  private iceServers?: RTCIceServer[];

  constructor(private h: Handlers) {}

  connect(): Promise<void> {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("WebSocket error"));
      this.ws.onclose = () => this.h.onPeerLeft?.();
      this.ws.onmessage = (e) => this.onServer(JSON.parse(e.data) as ServerMsg);
    });
  }

  createRoom() {
    this.role = "host";
    this.sendServer({ t: "create" });
  }

  joinRoom(code: string) {
    this.role = "guest";
    this.sendServer({ t: "join", code });
  }

  /** Send a peer message — prefers the P2P datachannel when open. */
  send(m: PeerMsg) {
    if (this.p2p && this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(m));
    } else {
      this.sendServer({ t: "msg", payload: m });
    }
  }

  private sendServer(m: ClientMsg) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(m));
  }

  private onServer(m: ServerMsg) {
    switch (m.t) {
      case "created":
        this.code = m.code;
        this.h.onRole?.("host", m.code);
        break;
      case "joined":
        this.h.onRole?.("guest", this.code);
        break;
      case "peer-joined":
        this.h.onPeerJoined?.();
        void this.startRtc(true); // host initiates the datachannel
        break;
      case "peer-left":
        this.h.onPeerLeft?.();
        break;
      case "error":
        this.h.onError?.(m.msg);
        break;
      case "peer-msg":
        this.handlePeer(m.payload);
        break;
    }
  }

  private handlePeer(m: PeerMsg) {
    if (m.t === "rtc") {
      void this.onRtcSignal(m.data);
      return;
    }
    this.h.onPeerMsg?.(m);
  }

  private async getIceServers(): Promise<RTCIceServer[]> {
    if (this.iceServers) return this.iceServers;
    try {
      const r = await fetch("/ice");
      this.iceServers = (await r.json()).iceServers as RTCIceServer[];
    } catch {
      this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    }
    return this.iceServers;
  }

  // ---- WebRTC upgrade (best effort) ----
  private async startRtc(initiator: boolean) {
    if (this.pc) return;
    const pc = new RTCPeerConnection({ iceServers: await this.getIceServers() });
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendRtc({ kind: "ice", candidate: e.candidate.toJSON() });
    };

    if (initiator) {
      const dc = pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 });
      this.bindDc(dc);
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendRtc({ kind: "offer", sdp: offer.sdp! });
      };
    } else {
      pc.ondatachannel = (e) => this.bindDc(e.channel);
    }
  }

  private bindDc(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.p2p = true;
      this.h.onTransport?.("p2p");
    };
    dc.onclose = () => {
      this.p2p = false;
      this.h.onTransport?.("relay");
    };
    dc.onmessage = (e) => this.handlePeer(JSON.parse(e.data) as PeerMsg);
  }

  private sendRtc(data: RtcSignal) {
    this.sendServer({ t: "msg", payload: { t: "rtc", data } });
  }

  private async onRtcSignal(sig: RtcSignal) {
    if (!this.pc) await this.startRtc(false);
    const pc = this.pc!;
    if (sig.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: sig.sdp });
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      this.sendRtc({ kind: "answer", sdp: ans.sdp! });
    } else if (sig.kind === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: sig.sdp });
    } else if (sig.kind === "ice") {
      try {
        await pc.addIceCandidate(sig.candidate);
      } catch {
        /* ignore late/duplicate candidates */
      }
    }
  }
}
