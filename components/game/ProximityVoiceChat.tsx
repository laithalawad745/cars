// =====================================
// 📁 components/game/ProximityVoiceChat.tsx
// =====================================
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Volume2, Users, User } from 'lucide-react';
import VoiceChat from '@/lib/webrtc';
import SocketClient from '@/lib/socket';

interface ProximityVoiceChatProps {
  roomId: string;
  players: any[];
  nearbyPlayer?: any;
}

export default function ProximityVoiceChat({ roomId, players, nearbyPlayer }: ProximityVoiceChatProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'all' | 'proximity'>('all');
  const [isPrivateTalking, setIsPrivateTalking] = useState(false);
  const [currentPrivateTarget, setCurrentPrivateTarget] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = new AudioContext();
    
    // Socket events for proximity voice
    SocketClient.on('proximity-voice-request', ({ fromId, fromName }) => {
      console.log(`${fromName} wants to talk privately with you`);
      // Auto-accept private voice for now
      acceptPrivateVoice(fromId);
    });

    SocketClient.on('proximity-voice-accepted', ({ targetId }) => {
      console.log('Private voice accepted with:', targetId);
      setCurrentPrivateTarget(targetId);
      setVoiceMode('proximity');
    });

    SocketClient.on('proximity-voice-ended', ({ fromId }) => {
      console.log('Private voice ended with:', fromId);
      if (currentPrivateTarget === fromId) {
        setCurrentPrivateTarget(null);
        setVoiceMode('all');
      }
    });

    // WebRTC signaling
    SocketClient.on('voice-signal', async ({ fromId, signal, isPrivate }) => {
      console.log('Received voice signal:', { fromId, isPrivate });
      
      let peer = VoiceChat.getPeer(fromId);
      if (!peer && localStreamRef.current) {
        peer = VoiceChat.createPeer(false, fromId);
        
        peer.on('signal', (data) => {
          SocketClient.emit('voice-signal', {
            targetId: fromId,
            signal: data,
            isPrivate
          });
        });
        
        peer.on('stream', (stream) => {
          handleRemoteStream(fromId, stream, isPrivate);
        });
      }
      
      if (peer) {
        peer.signal(signal);
      }
    });

    return () => {
      SocketClient.off('proximity-voice-request');
      SocketClient.off('proximity-voice-accepted');
      SocketClient.off('proximity-voice-ended');
      SocketClient.off('voice-signal');
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [currentPrivateTarget]);

  // Start voice chat
  const startVoiceChat = async () => {
    try {
      console.log('Starting voice chat...');
      const stream = await VoiceChat.initializeLocalStream();
      localStreamRef.current = stream;
      setIsVoiceEnabled(true);
      
      // Connect to all players initially
      if (voiceMode === 'all') {
        connectToAllPlayers();
      }
      
      // Monitor microphone activity
      monitorMicrophoneActivity(stream);
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
    setCurrentPrivateTarget(null);
    setVoiceMode('all');
  };

  // Connect to all players
  const connectToAllPlayers = () => {
    players.forEach(player => {
      if (player.id !== SocketClient.id) {
        connectToPeer(player.id, false);
      }
    });
  };

  // Connect to specific peer
  const connectToPeer = (peerId: string, isPrivate: boolean = false) => {
    if (!localStreamRef.current) return;
    
    console.log(`Connecting to peer: ${peerId} (private: ${isPrivate})`);
    
    const peer = VoiceChat.createPeer(true, peerId);
    
    peer.on('signal', (data) => {
      SocketClient.emit('voice-signal', {
        targetId: peerId,
        signal: data,
        isPrivate
      });
    });
    
    peer.on('stream', (stream) => {
      handleRemoteStream(peerId, stream, isPrivate);
    });
    
    peer.on('connect', () => {
      console.log(`Connected to peer: ${peerId}`);
      setConnectedPeers(prev => [...prev, peerId]);
    });
  };

  // Handle remote stream
  const handleRemoteStream = (peerId: string, stream: MediaStream, isPrivate: boolean) => {
    let audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `audio-${peerId}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    
    audio.srcObject = stream;
    
    // Mute/unmute based on voice mode
    if (voiceMode === 'proximity' && !isPrivate) {
      audio.volume = 0; // Mute public voices in proximity mode
    } else if (voiceMode === 'all' && isPrivate) {
      audio.volume = 0; // Mute private voices in all mode
    } else {
      audio.volume = 1;
    }
    
    // Monitor speaking activity
    monitorSpeakingActivity(peerId, stream);
  };

  // Monitor microphone activity
  const monitorMicrophoneActivity = (stream: MediaStream) => {
    if (!audioContextRef.current) return;
    
    const analyser = audioContextRef.current.createAnalyser();
    const microphone = audioContextRef.current.createMediaStreamSource(stream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (!localStreamRef.current) return;
      
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      if (average > 30 && !isMuted) {
        document.getElementById('mic-indicator')?.classList.add('ring-4', 'ring-green-400');
      } else {
        document.getElementById('mic-indicator')?.classList.remove('ring-4', 'ring-green-400');
      }
      
      requestAnimationFrame(checkAudioLevel);
    };
    
    checkAudioLevel();
  };

  // Monitor speaking activity for a peer
  const monitorSpeakingActivity = (peerId: string, stream: MediaStream) => {
    if (!audioContextRef.current) return;
    
    const analyser = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
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

  // Start private conversation
  const startPrivateConversation = () => {
    if (!nearbyPlayer || !isVoiceEnabled) return;
    
    console.log('Starting private conversation with:', nearbyPlayer.name);
    setIsPrivateTalking(true);
    
    // Disconnect from all other players
    players.forEach(player => {
      if (player.id !== SocketClient.id && player.id !== nearbyPlayer.id) {
        VoiceChat.removePeer(player.id);
      }
    });
    
    // Connect only to nearby player
    connectToPeer(nearbyPlayer.id, true);
    setCurrentPrivateTarget(nearbyPlayer.id);
    setVoiceMode('proximity');
    
    // Notify the other player
    SocketClient.emit('proximity-voice-request', {
      roomId,
      targetId: nearbyPlayer.id
    });
  };

  // End private conversation
  const endPrivateConversation = () => {
    if (!currentPrivateTarget) return;
    
    console.log('Ending private conversation');
    setIsPrivateTalking(false);
    
    // Notify the other player
    SocketClient.emit('proximity-voice-ended', {
      roomId,
      targetId: currentPrivateTarget
    });
    
    setCurrentPrivateTarget(null);
    setVoiceMode('all');
    
    // Reconnect to all players
    connectToAllPlayers();
  };

  // Accept private voice request
  const acceptPrivateVoice = (fromId: string) => {
    setCurrentPrivateTarget(fromId);
    setVoiceMode('proximity');
    
    // Disconnect from others and connect only to requester
    players.forEach(player => {
      if (player.id !== SocketClient.id && player.id !== fromId) {
        VoiceChat.removePeer(player.id);
      }
    });
    
    connectToPeer(fromId, true);
    
    SocketClient.emit('proximity-voice-accepted', {
      roomId,
      targetId: fromId
    });
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

  // Keyboard shortcut for push-to-talk private
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        if (nearbyPlayer && !isPrivateTalking) {
          startPrivateConversation();
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        if (isPrivateTalking) {
          endPrivateConversation();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [nearbyPlayer, isPrivateTalking]);

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
            {/* Voice mode indicator */}
            <div className="bg-black/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400 mb-1">وضع الصوت:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setVoiceMode('all');
                    if (isPrivateTalking) endPrivateConversation();
                  }}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-all ${
                    voiceMode === 'all' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  <Users className="inline w-3 h-3 mr-1" />
                  الجميع
                </button>
                <button
                  disabled={!nearbyPlayer}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-all ${
                    voiceMode === 'proximity' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-700 text-gray-400'
                  } ${!nearbyPlayer && 'opacity-50 cursor-not-allowed'}`}
                >
                  <User className="inline w-3 h-3 mr-1" />
                  خاص
                </button>
              </div>
            </div>

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
              <span>{isMuted ? 'صامت' : 'يتحدث'}</span>
            </button>

            {/* Private conversation indicator */}
            {isPrivateTalking && currentPrivateTarget && (
              <div className="bg-green-500/20 border border-green-500 rounded-lg p-2">
                <p className="text-green-400 text-xs text-center">
                  🔒 محادثة خاصة مع:
                </p>
                <p className="text-white text-sm text-center font-bold">
                  {players.find(p => p.id === currentPrivateTarget)?.name}
                </p>
                <button
                  onClick={endPrivateConversation}
                  className="w-full mt-2 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                >
                  إنهاء المحادثة الخاصة
                </button>
              </div>
            )}

            {/* Nearby player prompt */}
            {nearbyPlayer && !isPrivateTalking && (
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-2">
                <p className="text-blue-400 text-xs text-center mb-1">
                  قريب من: {nearbyPlayer.name}
                </p>
                <p className="text-white text-xs text-center">
                  اضغط واستمر V للتحدث معه سراً
                </p>
              </div>
            )}

            {/* Connected peers */}
            <div className="text-xs text-gray-300">
              <p>متصل: {connectedPeers.length} لاعب</p>
              {speaking.size > 0 && (
                <p className="text-green-400 animate-pulse">
                  يتحدث: {Array.from(speaking).map(id => 
                    players.find(p => p.id === id)?.name || 'مجهول'
                  ).join(', ')}
                </p>
              )}
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="text-xs text-gray-500 text-center">
          <p>V - اضغط للتحدث الخاص</p>
          <p>M - كتم الصوت</p>
        </div>
      </div>
    </div>
  );
}