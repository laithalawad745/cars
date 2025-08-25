import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff } from 'lucide-react';
import VoiceChat from '@/lib/webrtc';

export default function VoiceChatControls() {
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [volume, setVolume] = useState(100);

  useEffect(() => {
    // Initialize voice chat when component mounts
    initializeVoiceChat();

    return () => {
      VoiceChat.disconnectAll();
    };
  }, []);

  const initializeVoiceChat = async () => {
    try {
      await VoiceChat.initializeLocalStream();
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to initialize voice chat:', error);
      setIsConnected(false);
    }
  };

  const toggleMute = () => {
    const muted = VoiceChat.toggleMute();
    setIsMuted(muted);
  };

  const toggleConnection = () => {
    if (isConnected) {
      VoiceChat.disconnectAll();
      setIsConnected(false);
    } else {
      initializeVoiceChat();
    }
  };

  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-4 top-1/2 transform -translate-y-1/2 bg-black/50 backdrop-blur-lg rounded-2xl p-4 space-y-4"
    >
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
        <span className="text-white text-sm">
          {isConnected ? 'متصل' : 'غير متصل'}
        </span>
      </div>

      {/* Mute Button */}
      <button
        onClick={toggleMute}
        disabled={!isConnected}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          isMuted 
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-gray-700 hover:bg-gray-600'
        } ${!isConnected && 'opacity-50 cursor-not-allowed'}`}
      >
        {isMuted ? <MicOff className="text-white" /> : <Mic className="text-white" />}
      </button>

      {/* Volume Control */}
      <div className="flex flex-col items-center gap-2">
        <Volume2 className="text-gray-400" size={20} />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(parseInt(e.target.value))}
          className="w-24 rotate-[-90deg]"
          disabled={!isConnected}
        />
        <span className="text-gray-400 text-xs">{volume}%</span>
      </div>

      {/* Connect/Disconnect Button */}
      <button
        onClick={toggleConnection}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          isConnected 
            ? 'bg-green-500 hover:bg-green-600' 
            : 'bg-gray-700 hover:bg-gray-600'
        }`}
      >
        {isConnected ? <Phone className="text-white" /> : <PhoneOff className="text-white" />}
      </button>
    </motion.div>
  );
}