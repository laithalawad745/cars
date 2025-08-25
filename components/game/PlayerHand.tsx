import React from 'react';
import { motion } from 'framer-motion';
import { CarPart } from '@/types/game';

interface PlayerHandProps {
  part: CarPart | null;
  isLeader: boolean;
}

const partInfo: Record<CarPart, { name: string; emoji: string; color: string }> = {
  [CarPart.CHASSIS]: { name: 'الهيكل', emoji: '🏗️', color: 'from-yellow-400 to-orange-500' },
  [CarPart.ENGINE]: { name: 'المحرك', emoji: '⚙️', color: 'from-red-500 to-pink-600' },
  [CarPart.GEARBOX]: { name: 'القير', emoji: '🔧', color: 'from-blue-500 to-indigo-600' },
  [CarPart.WHEEL]: { name: 'الدولاب', emoji: '🛞', color: 'from-gray-600 to-gray-800' },
};

export default function PlayerHand({ part, isLeader }: PlayerHandProps) {
  if (!part) return null;

  const info = partInfo[part];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-72 pointer-events-none">
      <div className="relative h-full">
        {/* تأثير الظل */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
        
        {/* اليد والقطعة */}
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2"
        >
          {/* رسم اليد ثلاثي الأبعاد */}
          <div className="relative">
            {/* الذراع */}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-40 bg-gradient-to-t from-amber-100 to-amber-50 rounded-t-3xl shadow-2xl"></div>
            
            {/* اليد */}
            <svg
              viewBox="0 0 300 200"
              className="relative w-80 h-48"
              style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))' }}
            >
              {/* كف اليد */}
              <path
                d="M50,150 Q100,140 150,130 L150,70 Q145,60 135,60 L135,30 Q130,20 120,20 L120,40 Q115,30 105,30 L105,50 Q100,40 90,40 L90,60 Q85,50 75,50 L75,80 Q50,100 50,150"
                fill="url(#handGradient)"
                stroke="#d4a374"
                strokeWidth="2"
              />
              
              {/* الإبهام */}
              <ellipse cx="80" cy="100" rx="25" ry="40" fill="url(#thumbGradient)" transform="rotate(-30 80 100)" />
              
              {/* التدرجات */}
              <defs>
                <linearGradient id="handGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
                <linearGradient id="thumbGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>

            {/* القطعة في اليد */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: "spring" }}
              className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-8"
            >
              <div className={`relative bg-gradient-to-br ${info.color} rounded-2xl p-6 shadow-2xl`}>
                <div className="text-6xl text-center mb-2">{info.emoji}</div>
                <div className="text-white text-center">
                  <p className="font-bold text-xl">{info.name}</p>
                  {isLeader && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-yellow-300 text-sm mt-1"
                    >
                      👑 أنت القائد
                    </motion.p>
                  )}
                </div>
              </div>

              {/* تأثير اللمعان */}
              <div className="absolute inset-0 bg-white/20 rounded-2xl animate-pulse"></div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
