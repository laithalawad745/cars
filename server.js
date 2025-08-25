const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

// Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Game state
const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getPartsForPlayerCount(count) {
  const parts = ['chassis', 'engine', 'gearbox'];
  const wheelCount = count - 3;
  for (let i = 0; i < wheelCount; i++) {
    parts.push('wheel');
  }
  return parts;
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Player connected:', socket.id);

    // Create room
    socket.on('create-room', ({ roomId, playerName }) => {
      console.log(`Creating room ${roomId} for ${playerName}`);
      
      const room = {
        id: roomId,
        host: socket.id,
        players: [{
          id: socket.id,
          socketId: socket.id,
          name: playerName,
          isHost: true,
          part: null,
          isAlive: true,
          position: { x: 0, y: 1.6, z: 5 },
          rotation: { y: 0 }
        }],
        currentPhase: 'waiting',
        currentLeader: null,
        collectedParts: [],
        roundNumber: 0,
        winners: []
      };

      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerId = socket.id;

      io.to(socket.id).emit('game-state-update', room);
      console.log(`✅ Room ${roomId} created successfully`);
    });

    // Join room
    socket.on('join-room', ({ roomId, playerName }) => {
      console.log(`${playerName} trying to join room ${roomId}`);
      
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('error', 'الغرفة غير موجودة');
        console.log(`❌ Room ${roomId} not found`);
        return;
      }

      if (room.players.length >= 8) {
        socket.emit('error', 'الغرفة ممتلئة');
        return;
      }

      // Generate random spawn position
      const angle = (room.players.length * Math.PI * 2) / 8;
      const spawnX = Math.sin(angle) * 5;
      const spawnZ = Math.cos(angle) * 5;

      const player = {
        id: socket.id,
        socketId: socket.id,
        name: playerName,
        isHost: false,
        part: null,
        isAlive: true,
        position: { x: spawnX, y: 1.6, z: spawnZ },
        rotation: { y: 0 }
      };

      room.players.push(player);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerId = socket.id;

      // Send update to all players in room
      io.to(roomId).emit('game-state-update', room);
      
      // Send existing players' positions to new player
      room.players.forEach(p => {
        if (p.id !== socket.id && p.position) {
          io.to(socket.id).emit('player-moved', {
            playerId: p.id,
            position: p.position,
            rotation: p.rotation || { y: 0 }
          });
        }
      });
      
      console.log(`✅ ${playerName} joined room ${roomId}. Players: ${room.players.length}`);
    });

    // Player movement in 3D space
    socket.on('player-move', ({ roomId, position, rotation }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Update player position
      player.position = position;
      player.rotation = rotation;

      // Broadcast to OTHER players in the room (not sender)
      socket.to(roomId).emit('player-moved', {
        playerId: socket.id,
        position,
        rotation
      });
      
      // Debug log
      console.log(`Player ${socket.id.substring(0,8)} moved to:`, position);
    });

    // Start game
    socket.on('start-game', (roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.players.length < 3) {
        socket.emit('error', 'عدد اللاعبين غير كافي');
        return;
      }

      // Distribute parts
      const parts = getPartsForPlayerCount(room.players.length);
      const shuffledParts = shuffleArray(parts);
      
      // Set initial positions for all players
      room.players.forEach((player, index) => {
        player.part = shuffledParts[index];
        if (player.part === 'chassis') {
          room.currentLeader = player.id;
        }
        
        // Set spawn positions in a circle
        const angle = (index * Math.PI * 2) / room.players.length;
        player.position = {
          x: Math.sin(angle) * 5,
          y: 0.8,
          z: Math.cos(angle) * 5
        };
        player.rotation = { y: -angle };
      });

      room.currentPhase = 'negotiation';
      room.roundNumber = 1;

      // Send complete game state with positions
      io.to(roomId).emit('game-state-update', room);
      
      // Send initial positions to all players
      room.players.forEach(player => {
        io.to(roomId).emit('player-moved', {
          playerId: player.id,
          position: player.position,
          rotation: player.rotation
        });
      });
      
      console.log(`🎮 Game started in room ${roomId} with ${room.players.length} players`);
    });

    // Negotiate
    socket.on('negotiate', ({ roomId, targetPlayerId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const requestingPlayer = room.players.find(p => p.id === socket.id);
      const targetPlayer = room.players.find(p => p.id === targetPlayerId);

      if (!requestingPlayer || !targetPlayer) return;
      
      // Check if requesting player is the leader (has chassis)
      if (requestingPlayer.part !== 'chassis') {
        socket.emit('error', 'فقط القائد يمكنه التفاوض');
        return;
      }

      // Check if players are close enough (within 3 units)
      const dx = requestingPlayer.position.x - targetPlayer.position.x;
      const dz = requestingPlayer.position.z - targetPlayer.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance > 3) {
        socket.emit('error', 'اللاعب بعيد جداً');
        return;
      }

      io.to(targetPlayer.socketId).emit('negotiation-request', {
        fromPlayerId: socket.id,
        fromPlayerName: requestingPlayer.name
      });
      
      console.log(`📢 Negotiation request from ${requestingPlayer.name} to ${targetPlayer.name}`);
    });

    // Negotiation response
    socket.on('negotiation-response', ({ roomId, fromPlayerId, givePart, isGenuine }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const respondingPlayer = room.players.find(p => p.id === socket.id);
      if (!respondingPlayer) return;

      if (givePart) {
        room.collectedParts.push({
          playerId: respondingPlayer.id,
          part: respondingPlayer.part,
          isGenuine: isGenuine
        });

        io.to(roomId).emit('part-collected', {
          fromPlayerId: respondingPlayer.id,
          fromPlayerName: respondingPlayer.name
        });
        
        console.log(`✅ ${respondingPlayer.name} gave ${isGenuine ? 'genuine' : 'fake'} ${respondingPlayer.part}`);
      } else {
        console.log(`❌ ${respondingPlayer.name} refused to give part`);
      }

      io.to(roomId).emit('game-state-update', room);
    });

    // Assemble car
    socket.on('assemble-car', (roomId) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const requestingPlayer = room.players.find(p => p.id === socket.id);
      if (!requestingPlayer || requestingPlayer.part !== 'chassis') {
        socket.emit('error', 'فقط القائد يمكنه التجميع');
        return;
      }

      room.currentPhase = 'assembly';
      const allGenuine = room.collectedParts.every(p => p.isGenuine);

      io.to(roomId).emit('assembly-result', {
        success: allGenuine,
        revealedParts: room.collectedParts
      });

      console.log(`🔧 Assembly ${allGenuine ? 'succeeded' : 'failed'} in room ${roomId}`);

      if (allGenuine) {
        // Success - leader chooses who to eliminate
        setTimeout(() => {
          room.currentPhase = 'elimination';
          io.to(socket.id).emit('choose-elimination', {
            alivePlayers: room.players.filter(p => p.isAlive && p.id !== socket.id)
          });
        }, 3000);
      } else {
        // Failed - redistribute parts
        setTimeout(() => {
          room.collectedParts = [];
          room.currentPhase = 'negotiation';
          
          // Redistribute parts
          const alivePlayers = room.players.filter(p => p.isAlive);
          const parts = getPartsForPlayerCount(alivePlayers.length);
          const shuffledParts = shuffleArray(parts);
          
          alivePlayers.forEach((player, index) => {
            player.part = shuffledParts[index];
            if (player.part === 'chassis') {
              room.currentLeader = player.id;
            }
          });

          io.to(roomId).emit('game-state-update', room);
          io.to(roomId).emit('round-reset', {
            message: 'التجميع فشل! إعادة توزيع الأدوار...'
          });
        }, 3000);
      }
    });

    // Select player to eliminate
    socket.on('eliminate-player', ({ roomId, eliminatedPlayerId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const eliminatedPlayer = room.players.find(p => p.id === eliminatedPlayerId);
      if (eliminatedPlayer) {
        eliminatedPlayer.isAlive = false;
        
        io.to(eliminatedPlayer.socketId).emit('eliminated', {
          message: 'تم استبعادك من اللعبة!'
        });
        
        console.log(`💀 ${eliminatedPlayer.name} eliminated from room ${roomId}`);
      }

      // Check win condition
      const alivePlayers = room.players.filter(p => p.isAlive);
      
      if (alivePlayers.length <= 2) {
        // Game Over - Winners!
        room.winners = alivePlayers.map(p => p.id);
        room.currentPhase = 'finished';
        
        io.to(roomId).emit('game-over', {
          winners: alivePlayers.map(p => ({ 
            id: p.id, 
            name: p.name 
          }))
        });
        
        console.log(`🏆 Game over in room ${roomId}. Winners: ${alivePlayers.map(p => p.name).join(', ')}`);
      } else {
        // Next Round
        room.roundNumber++;
        room.collectedParts = [];
        
        // Redistribute parts
        const parts = getPartsForPlayerCount(alivePlayers.length);
        const shuffledParts = shuffleArray(parts);
        
        alivePlayers.forEach((player, index) => {
          player.part = shuffledParts[index];
          if (player.part === 'chassis') {
            room.currentLeader = player.id;
          }
        });
        
        room.currentPhase = 'negotiation';
        io.to(roomId).emit('next-round', room);
        
        console.log(`🔄 Round ${room.roundNumber} started in room ${roomId}`);
      }
    });

    // Voice chat signaling (for WebRTC)
    socket.on('voice-signal', ({ targetId, signal }) => {
      io.to(targetId).emit('voice-signal', {
        fromId: socket.id,
        signal
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          room.players = room.players.filter(p => p.id !== socket.id);
          
          if (room.players.length === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} deleted (empty)`);
          } else {
            // Assign new host if needed
            if (room.host === socket.id && room.players.length > 0) {
              room.host = room.players[0].id;
              room.players[0].isHost = true;
            }
            io.to(roomId).emit('game-state-update', room);
            io.to(roomId).emit('player-left', {
              playerId: socket.id
            });
          }
        }
      }
      
      console.log('🔌 Player disconnected:', socket.id);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> Socket.IO server is running');
    console.log('> 3D Game Mode Enabled 🎮');
  });
});