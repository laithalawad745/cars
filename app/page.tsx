'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function HomePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createRoom = async () => {
    if (!playerName.trim()) return;
    
    setIsCreating(true);
    // Generate random room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Save player data to localStorage
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('isHost', 'true');
    
    // Navigate to game room
    router.push(`/game/${code}`);
  };

  const joinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('isHost', 'false');
    
    router.push(`/game/${roomCode.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
      <div className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-bold text-white mb-4">
            🚗 لعبة تجميع السيارة
          </h1>
          <p className="text-xl text-gray-200">
            اجمع القطع، اخدع أصدقاءك، واربح السباق!
          </p>
        </motion.div>

        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl"
          >
            <input
              type="text"
              placeholder="اسمك في اللعبة"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 mb-4 rounded-lg bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:border-white"
              dir="rtl"
            />

            <div className="space-y-4">
              <button
                onClick={createRoom}
                disabled={isCreating || !playerName}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'جاري الإنشاء...' : '🎮 إنشاء غرفة جديدة'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-400"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-transparent text-gray-300">أو</span>
                </div>
              </div>

              <input
                type="text"
                placeholder="كود الغرفة"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:border-white text-center font-mono text-xl"
                maxLength={6}
              />

              <button
                onClick={joinRoom}
                disabled={!playerName || !roomCode}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚪 الانضمام للغرفة
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center text-gray-300"
          >
            <p className="mb-2">📋 القواعد:</p>
            <ul className="text-sm space-y-1" dir="rtl">
              <li>• 3-8 لاعبين</li>
              <li>• اجمع القطع لبناء السيارة</li>
              <li>• احذر من القطع المعطوبة!</li>
              <li>• آخر لاعبين يفوزان</li>
            </ul>
          </motion.div>
        </div>
      </div>
    </div>
  );
}