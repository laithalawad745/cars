import { io, Socket } from 'socket.io-client';

class SocketClient {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      // Connect directly to the server (not through Next.js API)
      this.socket = io('http://localhost:3000', {
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('✅ Connected to server with ID:', this.socket?.id);
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
      });

      this.socket.on('error', (error: any) => {
        console.error('Socket error:', error);
      });

      // Debug: Log all events
      this.socket.onAny((event, ...args) => {
        console.log(`📨 Event: ${event}`, args);
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      console.log(`📤 Emitting: ${event}`, data);
      this.socket.emit(event, data);
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (data: any) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  get id() {
    return this.socket?.id;
  }
}

export default new SocketClient();