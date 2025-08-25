'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import SocketClient from '@/lib/socket';

// Import components dynamically to avoid SSR issues
const Game3D = dynamic(() => import('@/components/game/Game3D'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white text-xl">جاري تحميل اللعبة...</p>
      </div>
    </div>
  )
});

const ProximityVoiceChat = dynamic(() => import('@/components/game/ProximityVoiceChat'), {
  ssr: false
});

const NegotiationSystem = dynamic(() => import('@/components/game/NegotiationSystem'), {
  ssr: false
});

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  part: string | null;
  isAlive: boolean;
  position?: { x: number; y: number; z: number };
}

interface GameState {
  id: string;
  players: Player[];
  currentPhase: string;
  currentLeader: string | null;
  collectedParts: any[];
  roundNumber: number;
  winners: string[];
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string>('');
  const [nearbyPlayer, setNearbyPlayer] = useState<any>(null);

  useEffect(() => {
    const playerName = localStorage.getItem('playerName');
    const isHost = localStorage.getItem('isHost') === 'true';

    if (!playerName) {
      router.push('/');
      return;
    }

    // Connect to socket
    const socket = SocketClient.connect();
    
    const handleConnect = () => {
      console.log('Connected! Joining room...');
      setIsConnected(true);
      
      if (isHost) {
        SocketClient.emit('create-room', { roomId, playerName });
      } else {
        SocketClient.emit('join-room', { roomId, playerName });
      }
    };

    const handleGameStateUpdate = (state: GameState) => {
      console.log('Game state updated:', state);
      setGameState(state);
      const player = state.players.find(p => p.id === socket.id);
      setCurrentPlayer(player || null);
    };

    const handleError = (errorMsg: string) => {
      console.error('Game error:', errorMsg);
      setError(errorMsg);
    };

    // Listen for nearby player updates (from Game3D component)
    const handleNearbyPlayerUpdate = (player: any) => {
      setNearbyPlayer(player);
    };

    // Setup event listeners
    SocketClient.on('connect', handleConnect);
    SocketClient.on('game-state-update', handleGameStateUpdate);
    SocketClient.on('error', handleError);
    SocketClient.on('nearby-player-update', handleNearbyPlayerUpdate);

    // Check if already connected
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      SocketClient.off('connect', handleConnect);
      SocketClient.off('game-state-update', handleGameStateUpdate);
      SocketClient.off('error', handleError);
      SocketClient.off('nearby-player-update', handleNearbyPlayerUpdate);
      SocketClient.disconnect();
    };
  }, [roomId, router]);

  const startGame = () => {
    SocketClient.emit('start-game', roomId);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/20 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full mx-4 border border-red-500">
          <h2 className="text-2xl font-bold text-white mb-4">خطأ ❌</h2>
          <p className="text-white mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (!isConnected || !gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">جاري الاتصال...</p>
          <p className="text-gray-300 mt-2">كود الغرفة: {roomId}</p>
        </div>
      </div>
    );
  }

  // Waiting room
  if (gameState.currentPhase === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-2xl w-full mx-4">
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
                <div className="flex items-center gap-2">
                  {player.isHost && <span className="text-yellow-400">👑 المضيف</span>}
                  {player.id === currentPlayer?.id && <span className="text-green-400">أنت</span>}
                </div>
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
  }

  // 3D Game
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {currentPlayer && currentPlayer.part && (
        <>
          {/* 3D Game Component */}
          <Game3D
            roomId={roomId}
            playerName={currentPlayer.name}
            playerPart={currentPlayer.part}
            players={gameState.players}
            isLeader={currentPlayer.part === 'chassis'}
            onNearbyPlayerChange={setNearbyPlayer}
          />
          
          {/* Negotiation System */}
          <NegotiationSystem
            roomId={roomId}
            playerName={currentPlayer.name}
            playerPart={currentPlayer.part}
            isLeader={currentPlayer.part === 'chassis'}
            players={gameState.players}
            collectedParts={gameState.collectedParts}
          />
          
          {/* Proximity Voice Chat */}
          <ProximityVoiceChat 
            roomId={roomId}
            players={gameState.players}
            nearbyPlayer={nearbyPlayer}
          />
        </>
      )}

      {/* Game Info Panel */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-lg rounded-lg p-4 text-white z-30">
        <p className="text-lg font-bold mb-2">معلومات اللعبة</p>
        <p>الجولة: {gameState.roundNumber}</p>
        <p>المرحلة: {getPhaseText(gameState.currentPhase)}</p>
        <p>اللاعبون الأحياء: {gameState.players.filter(p => p.isAlive).length}</p>
      </div>
    </div>
  );
}

// Helper function to get phase text in Arabic
function getPhaseText(phase: string): string {
  const phases: Record<string, string> = {
    'waiting': 'الانتظار',
    'distribution': 'توزيع الأدوار',
    'negotiation': 'التفاوض',
    'assembly': 'التجميع',
    'result': 'النتيجة',
    'elimination': 'الاستبعاد',
    'finished': 'انتهت'
  };
  return phases[phase] || phase;
}