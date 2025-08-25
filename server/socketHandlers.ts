import { Server, Socket } from 'socket.io';
import { GameManager } from './gameManager';
import { RoomManager } from './roomManager';

const gameManager = new GameManager();
const roomManager = new RoomManager();

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // إنشاء غرفة جديدة
    socket.on('create-room', (playerName: string) => {
      const room = roomManager.createRoom(socket.id, playerName);
      socket.join(room.id);
      socket.emit('room-created', room);
    });

    // الانضمام لغرفة
    socket.on('join-room', ({ roomId, playerName }) => {
      const room = roomManager.joinRoom(roomId, socket.id, playerName);
      if (room) {
        socket.join(roomId);
        io.to(roomId).emit('player-joined', room);
      } else {
        socket.emit('join-error', 'Room not found or full');
      }
    });

    // بدء اللعبة
    socket.on('start-game', (roomId: string) => {
      const gameState = gameManager.startGame(roomId);
      if (gameState) {
        io.to(roomId).emit('game-started', gameState);
        
        // توزيع الأدوار سراً لكل لاعب
        gameState.players.forEach(player => {
          io.to(player.socketId).emit('role-assigned', {
            part: player.part,
            isLeader: player.part === 'chassis'
          });
        });
      }
    });

    // مرحلة التفاوض
    socket.on('negotiate', ({ roomId, targetPlayerId, offer }) => {
      const targetPlayer = gameManager.getPlayer(roomId, targetPlayerId);
      if (targetPlayer) {
        io.to(targetPlayer.socketId).emit('negotiation-request', {
          fromPlayer: socket.id,
          offer
        });
      }
    });

    // الرد على التفاوض
    socket.on('negotiation-response', ({ roomId, fromPlayerId, part, isGenuine }) => {
      gameManager.addPart(roomId, fromPlayerId, part, isGenuine);
      io.to(roomId).emit('part-collected', { fromPlayerId, part });
    });

    // مرحلة التجميع
    socket.on('assemble-car', (roomId: string) => {
      const result = gameManager.assembleCar(roomId);
      io.to(roomId).emit('assembly-result', result);
      
      if (result.success) {
        // اختيار اللاعبين للركوب
        socket.emit('choose-riders', result.availablePlayers);
      } else {
        // إعادة توزيع الأدوار
        const newState = gameManager.redistributeRoles(roomId);
        io.to(roomId).emit('roles-redistributed', newState);
      }
    });

    // اختيار الراكبين
    socket.on('select-riders', ({ roomId, selectedPlayers }) => {
      const nextRound = gameManager.startNextRound(roomId, selectedPlayers);
      io.to(roomId).emit('next-round', nextRound);
    });

    // WebRTC Voice Chat
    socket.on('voice-signal', ({ targetId, signal }) => {
      io.to(targetId).emit('voice-signal', {
        fromId: socket.id,
        signal
      });
    });

    // قطع الاتصال
    socket.on('disconnect', () => {
      const room = roomManager.removePlayer(socket.id);
      if (room) {
        io.to(room.id).emit('player-left', room);
      }
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}