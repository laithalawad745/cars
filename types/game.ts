export enum CarPart {
  CHASSIS = 'chassis',
  ENGINE = 'engine',
  GEARBOX = 'gearbox',
  WHEEL = 'wheel'
}

export enum GamePhase {
  WAITING = 'waiting',
  DISTRIBUTION = 'distribution',
  NEGOTIATION = 'negotiation',
  ASSEMBLY = 'assembly',
  RESULT = 'result'
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  part: CarPart | null;
  isAlive: boolean;
  socketId: string;
}

export interface CollectedPart {
  playerId: string;
  part: CarPart;
  isGenuine: boolean;
}

export interface GameState {
  roomId: string;
  players: Player[];
  currentPhase: GamePhase;
  currentLeader: string | null;
  collectedParts: CollectedPart[];
  roundNumber: number;
  winners: string[];
}

export interface NegotiationOffer {
  fromPlayer: string;
  toPlayer: string;
  part: CarPart;
  isGenuine: boolean;
}