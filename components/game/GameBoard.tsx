import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PlayerHand from './PlayerHand';
import NegotiationDialog from './NegotiationDialog';
import AssemblyPhase from './AssemblyPhase';
import VoiceChatControls from './VoiceChatControls';
import { GameState, Player, GamePhase, CarPart } from '@/types/game';
import SocketClient from '@/lib/socket';

interface GameBoardProps {
  gameState: GameState;
  currentPlayer: Player | null;
  roomId: string;
}

export default function GameBoard({ gameState, currentPlayer, roomId }: GameBoardProps) {
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiationTarget, setNegotiationTarget] = useState<Player | null>(null);
  const isLeader = currentPlayer?.part === CarPart.CHASSIS;

  const startGame = () => {
    SocketClient.emit('start-game', roomId);
  };

  const initiateNegotiation = (targetPlayer: Player) => {
    if (!isLeader || targetPlayer.id === currentPlayer?.id) return;
    setNegotiationTarget(targetPlayer);
    setShowNegotiation(true);
  };

  const renderWaitingRoom = () => (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-2xl w-full">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">
          غرفة الانتظار 🎮
        </h2>
        
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <p className="text-gray-300 text-center mb-2">كود الغرفة:</p>
          <p className="text-4xl font-mono text-white text-center">{roomId}</p>
        </div>

        <div className="space-y-2 mb-6">
          <p className="text-gray-300">اللاعبون ({gameState.players.length}/8):</p>
          {gameState.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
              <span className="text-white">{player.name}</span>
              {player.isHost && <span className="text-yellow-400">👑 المضيف</span>}
            </div>
          ))}
        </div>

        {currentPlayer?.isHost && gameState.players.length >= 3 && (
          <button
            onClick={startGame}
            className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all"
          >
            بدء اللعبة 🚀
          </button>
        )}

        {gameState.players.length < 3 && (
          <p className="text-center text-gray-400">
            في انتظار {3 - gameState.players.length} لاعبين آخرين للبدء...
          </p>
        )}
      </div>
    </div>
  );

  const renderGameArea = () => {
    // عرض اللاعبين الآخرين في دائرة
    const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer?.id);
    const angleStep = (2 * Math.PI) / otherPlayers.length;

    return (
      <div className="relative w-full h-full">
        {/* خلفية اللعبة */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900 via-purple-800 to-pink-900">
          <div className="absolute inset-0 bg-[url('/assets/images/garage-bg.jpg')] opacity-20"></div>
        </div>

        {/* منطقة اللاعبين */}
        <div className="relative h-full flex items-center justify-center">
          <div className="relative w-96 h-96">
            {/* مركز اللعبة */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center">
                {gameState.currentPhase === GamePhase.ASSEMBLY ? (
                  <span className="text-4xl">🔧</span>
                ) : (
                  <span className="text-4xl">🚗</span>
                )}
              </div>
            </div>

            {/* اللاعبون الآخرون */}
            {otherPlayers.map((player, index) => {
              const angle = index * angleStep - Math.PI / 2;
              const x = Math.cos(angle) * 150;
              const y = Math.sin(angle) * 150;

              return (
                <motion.div
                  key={player.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  <button
                    onClick={() => initiateNegotiation(player)}
                    disabled={!isLeader || gameState.currentPhase !== GamePhase.NEGOTIATION}
                    className={`
                      relative group transition-all
                      ${isLeader && gameState.currentPhase === GamePhase.NEGOTIATION 
                        ? 'cursor-pointer hover:scale-110' 
                        : 'cursor-default'}
                    `}
                  >
                    {/* أيقونة اللاعب */}
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/30 group-hover:border-yellow-400">
                      <span className="text-3xl">👤</span>
                    </div>
                    
                    {/* اسم اللاعب */}
                    <div className="mt-2 bg-black/50 rounded-lg px-2 py-1">
                      <p className="text-white text-sm">{player.name}</p>
                      {player.part === CarPart.CHASSIS && (
                        <p className="text-yellow-400 text-xs">👑 القائد</p>
                      )}
                    </div>

                    {/* مؤشر القطعة (مخفي) */}
                    {gameState.collectedParts.some(cp => cp.playerId === player.id) && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* معلومات اللعبة */}
        <div className="absolute top-4 left-4 bg-black/50 rounded-lg p-4">
          <p className="text-white mb-2">الجولة: {gameState.roundNumber}</p>
          <p className="text-gray-300 text-sm">
            المرحلة: {gameState.currentPhase === GamePhase.NEGOTIATION ? 'التفاوض' : 
                     gameState.currentPhase === GamePhase.ASSEMBLY ? 'التجميع' : 
                     gameState.currentPhase === GamePhase.RESULT ? 'النتيجة' : 'الانتظار'}
          </p>
          <p className="text-gray-300 text-sm">
            اللاعبون الأحياء: {gameState.players.filter(p => p.isAlive).length}
          </p>
        </div>

        {/* قائمة القطع المجمعة (للقائد فقط) */}
        {isLeader && gameState.collectedParts.length > 0 && (
          <div className="absolute top-4 right-4 bg-black/50 rounded-lg p-4">
            <p className="text-white mb-2">القطع المجمعة:</p>
            <div className="space-y-1">
              {gameState.collectedParts.map((part, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-2xl">
                    {part.part === CarPart.ENGINE ? '⚙️' :
                     part.part === CarPart.GEARBOX ? '🔧' :
                     part.part === CarPart.WHEEL ? '🛞' : '❓'}
                  </span>
                  <span className="text-gray-300 text-sm">
                    {part.isGenuine ? '✅' : '❓'}
                  </span>
                </div>
              ))}
            </div>
            
            {gameState.collectedParts.length >= 3 && (
              <button
                onClick={() => SocketClient.emit('assemble-car', roomId)}
                className="mt-4 w-full py-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-bold rounded-lg hover:from-yellow-600 hover:to-orange-700"
              >
                🔧 تجميع السيارة
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {gameState.currentPhase === GamePhase.WAITING ? (
        renderWaitingRoom()
      ) : (
        <>
          {renderGameArea()}
          
          {/* يد اللاعب */}
          {currentPlayer && (
            <PlayerHand 
              part={currentPlayer.part} 
              isLeader={isLeader}
            />
          )}

          {/* نافذة التفاوض */}
          <AnimatePresence>
            {showNegotiation && negotiationTarget && (
              <NegotiationDialog
                targetPlayer={negotiationTarget}
                onClose={() => setShowNegotiation(false)}
                roomId={roomId}
              />
            )}
          </AnimatePresence>

          {/* مرحلة التجميع */}
          {gameState.currentPhase === GamePhase.ASSEMBLY && (
            <AssemblyPhase gameState={gameState} />
          )}

          {/* أدوات التحكم بالصوت */}
          <VoiceChatControls />
        </>
      )}
    </div>
  );
}