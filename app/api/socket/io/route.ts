import { Server as HTTPServer } from 'http';
import { NextApiRequest } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { NextResponse } from 'next/server';

export const config = {
  api: {
    bodyParser: false,
  },
};

let io: SocketIOServer | null = null;

// Game Rooms Storage
const rooms = new Map<string, GameRoom>();

interface GameRoom {
  id: string;
  host: string;
  players: Map<string, PlayerData>;
  gameState: GameState;
  roundParts: Map<string, { part: CarPart; isGenuine: boolean }>;
}

interface PlayerData {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  part: CarPart | null;
  isAlive: boolean;
}

function initializeSocketServer(httpServer: HTTPServer) {
  if (!io) {
    io = new SocketIOServer(httpServer, {
      path: '/api/socket/io',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : false,
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      console.log(`🔌 Player connected: ${socket.id}`);

      // Create Room
      socket.on('create-room', ({ roomId, playerName }) => {
        if (rooms.has(roomId)) {
          socket.emit('error', 'Room already exists');
          return;
        }

        const playerId = generatePlayerId();
        const room: GameRoom = {
          id: roomId,
          host: playerId,
          players: new Map(),
          gameState: {
            roomId,
            players: [],
            currentPhase: GamePhase.WAITING,
            currentLeader: null,
            collectedParts: [],
            roundNumber: 0,
            winners: [],
          },
          roundParts: new Map(),
        };

        const player: PlayerData = {
          id: playerId,
          socketId: socket.id,
          name: playerName,
          isHost: true,
          part: null,
          isAlive: true,
        };

        room.players.set(playerId, player);
        room.gameState.players.push(player);
        rooms.set(roomId, room);

        socket.join(roomId);
        socket.data.playerId = playerId;
        socket.data.roomId = roomId;

        socket.emit('game-state-update', room.gameState);
        console.log(`🏠 Room created: ${roomId} by ${playerName}`);
      });

      // Join Room
      socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit('error', 'Room not found');
          return;
        }

        if (room.players.size >= 8) {
          socket.emit('error', 'Room is full');
          return;
        }

        const playerId = generatePlayerId();
        const player: PlayerData = {
          id: playerId,
          socketId: socket.id,
          name: playerName,
          isHost: false,
          part: null,
          isAlive: true,
        };

        room.players.set(playerId, player);
        room.gameState.players.push(player);

        socket.join(roomId);
        socket.data.playerId = playerId;
        socket.data.roomId = roomId;

        io.to(roomId).emit('game-state-update', room.gameState);
        console.log(`👤 ${playerName} joined room ${roomId}`);
      });

      // Start Game
      socket.on('start-game', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || room.players.size < 3) {
          socket.emit('error', 'Not enough players');
          return;
        }

        // Distribute parts
        distributeParts(room);
        room.gameState.currentPhase = GamePhase.DISTRIBUTION;
        room.gameState.roundNumber = 1;

        // Send individual parts to each player secretly
        room.players.forEach((player) => {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit('part-assigned', {
              part: player.part,
              isLeader: player.part === CarPart.CHASSIS,
            });
          }
        });

        // Start negotiation phase after 3 seconds
        setTimeout(() => {
          room.gameState.currentPhase = GamePhase.NEGOTIATION;
          io.to(roomId).emit('game-state-update', room.gameState);
        }, 3000);

        io.to(roomId).emit('game-state-update', room.gameState);
        console.log(`🎮 Game started in room ${roomId}`);
      });

      // Negotiation Request
      socket.on('negotiate', ({ roomId, targetPlayerId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const requestingPlayer = room.players.get(socket.data.playerId);
        const targetPlayer = room.players.get(targetPlayerId);

        if (!requestingPlayer || !targetPlayer) return;
        if (requestingPlayer.part !== CarPart.CHASSIS) {
          socket.emit('error', 'Only the leader can negotiate');
          return;
        }

        const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
        if (targetSocket) {
          targetSocket.emit('negotiation-request', {
            fromPlayerId: requestingPlayer.id,
            fromPlayerName: requestingPlayer.name,
          });
        }
      });

      // Negotiation Response
      socket.on('negotiation-response', ({ roomId, fromPlayerId, givePart, isGenuine }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const respondingPlayer = room.players.get(socket.data.playerId);
        if (!respondingPlayer || !givePart) return;

        if (givePart) {
          room.gameState.collectedParts.push({
            playerId: respondingPlayer.id,
            part: respondingPlayer.part!,
            isGenuine: isGenuine,
          });

          // Store the actual genuineness secretly
          room.roundParts.set(respondingPlayer.id, {
            part: respondingPlayer.part!,
            isGenuine: isGenuine,
          });

          io.to(roomId).emit('part-collected', {
            fromPlayerId: respondingPlayer.id,
            fromPlayerName: respondingPlayer.name,
          });
        }

        io.to(roomId).emit('game-state-update', room.gameState);
      });

      // Assemble Car
      socket.on('assemble-car', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const requestingPlayer = room.players.get(socket.data.playerId);
        if (!requestingPlayer || requestingPlayer.part !== CarPart.CHASSIS) {
          socket.emit('error', 'Only the leader can assemble');
          return;
        }

        room.gameState.currentPhase = GamePhase.ASSEMBLY;

        // Check if all parts are genuine
        const allGenuine = Array.from(room.roundParts.values()).every(p => p.isGenuine);

        // Reveal the truth about parts
        const revealedParts = room.gameState.collectedParts.map(cp => ({
          ...cp,
          isGenuine: room.roundParts.get(cp.playerId)?.isGenuine || false,
        }));

        io.to(roomId).emit('assembly-result', {
          success: allGenuine,
          revealedParts,
        });

        if (allGenuine) {
          // Car assembled successfully - leader chooses who rides
          room.gameState.currentPhase = GamePhase.RESULT;
          
          const alivePlayers = Array.from(room.players.values())
            .filter(p => p.isAlive && p.id !== requestingPlayer.id);
          
          socket.emit('choose-riders', alivePlayers);
        } else {
          // Failed - redistribute parts
          setTimeout(() => {
            redistributeParts(room);
            io.to(roomId).emit('game-state-update', room.gameState);
          }, 3000);
        }
      });

      // Select Riders (eliminate one player)
      socket.on('select-riders', ({ roomId, eliminatedPlayerId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const eliminatedPlayer = room.players.get(eliminatedPlayerId);
        if (eliminatedPlayer) {
          eliminatedPlayer.isAlive = false;
          
          const eliminatedSocket = io.sockets.sockets.get(eliminatedPlayer.socketId);
          if (eliminatedSocket) {
            eliminatedSocket.emit('eliminated');
          }
        }

        // Check win condition
        const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
        
        if (alivePlayers.length <= 2) {
          // Game Over - Winners!
          room.gameState.winners = alivePlayers.map(p => p.id);
          room.gameState.currentPhase = GamePhase.WAITING;
          
          io.to(roomId).emit('game-over', {
            winners: alivePlayers.map(p => ({ id: p.id, name: p.name })),
          });
        } else {
          // Next Round
          room.gameState.roundNumber++;
          room.gameState.collectedParts = [];
          room.roundParts.clear();
          
          redistributeParts(room);
          room.gameState.currentPhase = GamePhase.NEGOTIATION;
          
          io.to(roomId).emit('next-round', room.gameState);
        }
      });

      // Voice Chat Signaling
      socket.on('voice-signal', ({ targetId, signal }) => {
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) {
          targetSocket.emit('voice-signal', {
            fromId: socket.id,
            signal,
          });
        }
      });

      // Disconnect
      socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        const playerId = socket.data.playerId;

        if (roomId && playerId) {
          const room = rooms.get(roomId);
          if (room) {
            room.players.delete(playerId);
            room.gameState.players = room.gameState.players.filter(p => p.id !== playerId);

            if (room.players.size === 0) {
              rooms.delete(roomId);
              console.log(`🗑️ Room ${roomId} deleted (empty)`);
            } else {
              // Assign new host if needed
              if (room.host === playerId) {
                const newHost = room.players.values().next().value;
                if (newHost) {
                  room.host = newHost.id;
                  newHost.isHost = true;
                }
              }
              io.to(roomId).emit('game-state-update', room.gameState);
            }
          }
        }

        console.log(`🔌 Player disconnected: ${socket.id}`);
      });
    });
  }

  return io;
}

// Helper Functions
function generatePlayerId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function distributeParts(room: GameRoom) {
  const players = Array.from(room.players.values()).filter(p => p.isAlive);
  const parts = getPartsForPlayerCount(players.length);
  
  // Shuffle parts
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  // Assign parts
  players.forEach((player, index) => {
    player.part = parts[index];
    if (player.part === CarPart.CHASSIS) {
      room.gameState.currentLeader = player.id;
    }
  });
}

function redistributeParts(room: GameRoom) {
  room.gameState.collectedParts = [];
  room.roundParts.clear();
  distributeParts(room);
  
  // Send new parts to players
  room.players.forEach((player) => {
    const playerSocket = io?.sockets.sockets.get(player.socketId);
    if (playerSocket) {
      playerSocket.emit('part-assigned', {
        part: player.part,
        isLeader: player.part === CarPart.CHASSIS,
      });
    }
  });
}

function getPartsForPlayerCount(count: number): CarPart[] {
  const parts: CarPart[] = [CarPart.CHASSIS, CarPart.ENGINE, CarPart.GEARBOX];
  
  // Add wheels based on player count
  const wheelCount = count - 3;
  for (let i = 0; i < wheelCount; i++) {
    parts.push(CarPart.WHEEL);
  }
  
  return parts;
}

export async function GET(req: NextApiRequest) {
  return NextResponse.json({ message: 'Socket.IO server is running' });
}