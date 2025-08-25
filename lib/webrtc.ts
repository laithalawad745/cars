import SimplePeer from 'simple-peer';

interface Peer {
  peer: SimplePeer.Instance;
  audio: HTMLAudioElement;
}

class VoiceChat {
  private peers: Map<string, Peer> = new Map();
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;

  async initializeLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });
      return this.localStream;
    } catch (error) {
      console.error('❌ Error accessing microphone:', error);
      throw error;
    }
  }

  createPeer(initiator: boolean, targetId: string): SimplePeer.Instance {
    if (!this.localStream) {
      throw new Error('Local stream not initialized');
    }

    const peer = new SimplePeer({
      initiator,
      stream: this.localStream,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
    });

    const audio = new Audio();
    audio.autoplay = true;

    peer.on('stream', (remoteStream) => {
      audio.srcObject = remoteStream;
    });

    peer.on('error', (err) => {
      console.error(`Peer error with ${targetId}:`, err);
    });

    peer.on('close', () => {
      this.removePeer(targetId);
    });

    this.peers.set(targetId, { peer, audio });
    return peer;
  }

  removePeer(targetId: string) {
    const peerData = this.peers.get(targetId);
    if (peerData) {
      peerData.peer.destroy();
      peerData.audio.pause();
      peerData.audio.srcObject = null;
      this.peers.delete(targetId);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    return this.isMuted;
  }

  setVolume(targetId: string, volume: number) {
    const peerData = this.peers.get(targetId);
    if (peerData) {
      peerData.audio.volume = Math.max(0, Math.min(1, volume));
    }
  }

  disconnectAll() {
    this.peers.forEach((_, targetId) => {
      this.removePeer(targetId);
    });
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  getPeer(targetId: string): SimplePeer.Instance | undefined {
    return this.peers.get(targetId)?.peer;
  }

  get muted() {
    return this.isMuted;
  }
}

export default new VoiceChat();
