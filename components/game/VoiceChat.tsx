// =====================================
// 📁 components/game/VoiceChat.tsx - المكالمات الصوتية
// =====================================
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import VoiceChat from '@/lib/webrtc';
import SocketClient from '@/lib/socket';

interface VoiceChatProps {
  roomId: string;
  players: any[];
}

export default function VoiceChatComponent({ roomId, players }: VoiceChatProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [volume, setVolume] = useState(100);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Initialize voice chat when component mounts
    startVoiceChat();

    // Socket events for WebRTC signaling
    SocketClient.on('voice-signal', async ({ fromId, signal }) => {
      console.log('Received voice signal from:', fromId);
      
      let peer = VoiceChat.getPeer(fromId);
      if (!peer && localStreamRef.current) {
        peer = VoiceChat.createPeer(false, fromId);
        
        peer.on('signal', (data) => {
          SocketClient.emit('voice-signal', {
            targetId: fromId,
            signal: data
          });
        });
        
        peer.on('stream', (stream) => {
          console.log('Received stream from:', fromId);
          handleRemoteStream(fromId, stream);
        });
      }
      
      if (peer) {
        peer.signal(signal);
      }
    });

    // When a new player joins, establish connection
    SocketClient.on('player-joined', (player: any) => {
      if (player.id !== SocketClient.id && localStreamRef.current) {
        connectToPeer(player.id);
      }
    });

    // When a player leaves, remove connection
    SocketClient.on('player-left', ({ playerId }) => {
      VoiceChat.removePeer(playerId);
      setConnectedPeers(prev => prev.filter(id => id !== playerId));
    });

    return () => {
      SocketClient.off('voice-signal');
      SocketClient.off('player-joined');
      SocketClient.off('player-left');
      stopVoiceChat();
    };
  }, [roomId]);

  // Start voice chat
  const startVoiceChat = async () => {
    try {
      console.log('Starting voice chat...');
      const stream = await VoiceChat.initializeLocalStream();
      localStreamRef.current = stream;
      setIsVoiceEnabled(true);
      
      // Connect to all existing players
      players.forEach(player => {
        if (player.id !== SocketClient.id) {
          connectToPeer(player.id);
        }
      });
      
      // Monitor local microphone activity
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!localStreamRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        // Visual feedback when speaking
        if (average > 30 && !isMuted) {
          document.getElementById('mic-indicator')?.classList.add('ring-4', 'ring-green-400');
        } else {
          document.getElementById('mic-indicator')?.classList.remove('ring-4', 'ring-green-400');
        }
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (error) {
      console.error('Failed to start voice chat:', error);
      setIsVoiceEnabled(false);
    }
  };

  // Stop voice chat
  const stopVoiceChat = () => {
    console.log('Stopping voice chat...');
    VoiceChat.disconnectAll();
    localStreamRef.current = null;
    setIsVoiceEnabled(false);
    setConnectedPeers([]);
  };

  // Connect to a specific peer
  const connectToPeer = (peerId: string) => {
    if (!localStreamRef.current) return;
    
    console.log('Connecting to peer:', peerId);
    
    const peer = VoiceChat.createPeer(true, peerId);
    
    peer.on('signal', (data) => {
      SocketClient.emit('voice-signal', {
        targetId: peerId,
        signal: data
      });
    });
    
    peer.on('stream', (stream) => {
      console.log('Received stream from:', peerId);
      handleRemoteStream(peerId, stream);
    });
    
    peer.on('connect', () => {
      console.log('Connected to peer:', peerId);
      setConnectedPeers(prev => [...prev, peerId]);
    });
  };

  // Handle remote stream
  const handleRemoteStream = (peerId: string, stream: MediaStream) => {
    // Create audio element for this peer
    let audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `audio-${peerId}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
    audio.volume = volume / 100;
    
    // Monitor speaking activity
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkSpeaking = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      if (average > 20) {
        setSpeaking(prev => new Set(prev).add(peerId));
      } else {
        setSpeaking(prev => {
          const newSet = new Set(prev);
          newSet.delete(peerId);
          return newSet;
        });
      }
      
      if (stream.active) {
        requestAnimationFrame(checkSpeaking);
      }
    };
    
    checkSpeaking();
  };

  // Toggle mute
  const toggleMute = () => {
    const muted = VoiceChat.toggleMute();
    setIsMuted(muted);
  };

  // Toggle voice chat
  const toggleVoiceChat = () => {
    if (isVoiceEnabled) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  };

  // Adjust volume
  const adjustVolume = (newVolume: number) => {
    setVolume(newVolume);
    // Apply to all audio elements
    connectedPeers.forEach(peerId => {
      const audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
      if (audio) {
        audio.volume = newVolume / 100;
      }
    });
  };

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className="bg-black/70 backdrop-blur-lg rounded-2xl p-4 space-y-3">
        {/* Voice toggle */}
        <button
          onClick={toggleVoiceChat}
          className={`w-full px-4 py-2 rounded-lg font-bold transition-all ${
            isVoiceEnabled 
              ? 'bg-green-500 hover:bg-green-600 text-white' 
              : 'bg-gray-600 hover:bg-gray-700 text-gray-200'
          }`}
        >
          {isVoiceEnabled ? '🎤 الصوت مفعل' : '🔇 الصوت معطل'}
        </button>

        {isVoiceEnabled && (
          <>
            {/* Mute button */}
            <button
              id="mic-indicator"
              onClick={toggleMute}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isMuted 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-gray-700 hover:bg-gray-600'
              } text-white`}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{isMuted ? 'ميكروفون مغلق' : 'ميكروفون مفتوح'}</span>
            </button>

            {/* Volume control */}
            <div className="flex items-center gap-2">
              <VolumeX size={16} className="text-gray-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => adjustVolume(parseInt(e.target.value))}
                className="flex-1"
              />
              <Volume2 size={16} className="text-gray-400" />
              <span className="text-white text-sm w-10">{volume}%</span>
            </div>

            {/* Connected peers */}
            <div className="text-xs text-gray-300">
              <p>متصل: {connectedPeers.length} لاعبين</p>
              {speaking.size > 0 && (
                <p className="text-green-400 animate-pulse">
                  يتحدث: {speaking.size} لاعب
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Speaking indicators for each player */}
      <div className="absolute -top-20 left-0 space-y-1">
        {Array.from(speaking).map(peerId => {
          const player = players.find(p => p.id === peerId);
          if (!player) return null;
          return (
            <div key={peerId} className="bg-green-500/80 text-white px-2 py-1 rounded text-xs animate-pulse">
              🎤 {player.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}