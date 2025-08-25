import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GameState, CarPart } from '@/types/game';
import SocketClient from '@/lib/socket';

interface AssemblyPhaseProps {
  gameState: GameState;
}

export default function AssemblyPhase({ gameState }: AssemblyPhaseProps) {
  const [assemblyResult, setAssemblyResult] = useState<{
    success: boolean;
    revealedParts: any[];
  } | null>(null);

  useEffect(() => {
    SocketClient.on('assembly-result', (result) => {
      setAssemblyResult(result);
    });

    return () => {
      SocketClient.off('assembly-result');
    };
  }, []);

  const partEmojis: Record<CarPart, string> = {
    [CarPart.CHASSIS]: '🏗️',
    [CarPart.ENGINE]: '⚙️',
    [CarPart.GEARBOX]: '🔧',
    [CarPart.WHEEL]: '🛞',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40"
    >
      <motion.div
        initial={{ scale: 0.5, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 1 }}
        className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-3xl p-8 max-w-2xl w-full mx-4"
      >
        <h2 className="text-3xl font-bold text-white text-center mb-8">
          🔧 مرحلة التجميع
        </h2>

        {!assemblyResult ? (
          <div className="text-center">
            <div className="relative w-64 h-64 mx-auto">
              {/* Rotating gears animation */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="text-8xl">⚙️</span>
              </motion.div>
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="text-6xl opacity-50">🔧</span>
              </motion.div>
            </div>
            <p className="text-white text-xl mt-4">جاري تجميع السيارة...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Parts reveal */}
            <div className="grid grid-cols-2 gap-4">
              {assemblyResult.revealedParts.map((part, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className={`p-4 rounded-lg ${
                    part.isGenuine 
                      ? 'bg-green-500/20 border-2 border-green-500' 
                      : 'bg-red-500/20 border-2 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{partEmojis[part.part]}</span>
                    <span className="text-2xl">
                      {part.isGenuine ? '✅' : '❌'}
                    </span>
                  </div>
                  <p className="text-white mt-2">
                    {part.isGenuine ? 'قطعة صالحة' : 'قطعة معطوبة!'}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Result message */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8 }}
              className="text-center"
            >
              {assemblyResult.success ? (
                <>
                  <div className="text-6xl mb-4">🚗✨</div>
                  <p className="text-green-400 text-2xl font-bold">
                    نجح التجميع! السيارة جاهزة
                  </p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">💥🚗</div>
                  <p className="text-red-400 text-2xl font-bold">
                    فشل التجميع! هناك قطع معطوبة
                  </p>
                  <p className="text-gray-300 mt-2">
                    سيتم إعادة توزيع الأدوار...
                  </p>
                </>
              )}
            </motion.div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}