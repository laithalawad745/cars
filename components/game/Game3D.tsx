// =====================================
// 📁 components/game/Game3D.tsx - Improved Characters
// =====================================
'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SocketClient from '@/lib/socket';

interface Game3DProps {
  roomId: string;
  playerName: string;
  playerPart: string;
  players: any[];
  isLeader: boolean;
}

export default function Game3D({ roomId, playerName, playerPart, players, isLeader }: Game3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [nearbyPlayer, setNearbyPlayer] = useState<any>(null);
  
  // Game references
  const gameRefs = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    clock: new THREE.Clock(),
    hand: null as THREE.Group | null,
    otherPlayers: new Map<string, THREE.Group>(),
    animationId: null as number | null
  });

  // Player state
  const playerState = useRef({
    position: { x: 0, y: 1.6, z: 5 },
    rotation: { x: 0, y: 0 },
    velocity: { x: 0, z: 0 },
    lastUpdate: 0,
    keys: {
      forward: false,
      backward: false,
      left: false,
      right: false
    }
  });

  useEffect(() => {
    if (!mountRef.current || gameStarted) return;
    console.log('🎮 Initializing game...');
    initGame();
    setGameStarted(true);
    return () => cleanup();
  }, []);

  useEffect(() => {
    if (!gameRefs.current.scene) return;
    updateOtherPlayersVisuals();
  }, [players]);

  const initGame = () => {
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 50);
    gameRefs.current.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.6, 5);
    gameRefs.current.camera = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current!.appendChild(renderer.domElement);
    gameRefs.current.renderer = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Environment
    createEnvironment(scene);
    createPlayerHand(scene, camera);
    createOtherPlayers(scene);
    setupControls(renderer, camera);
    setupSocketEvents(scene);
    animate();

    window.addEventListener('resize', handleResize);
  };

  const createEnvironment = (scene: THREE.Scene) => {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3a5f3a,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
    const createWall = (width: number, height: number, depth: number, x: number, y: number, z: number) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        wallMaterial
      );
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
    };

    createWall(20, 5, 0.5, 0, 2.5, -10);
    createWall(20, 5, 0.5, 0, 2.5, 10);
    createWall(0.5, 5, 20, 10, 2.5, 0);
    createWall(0.5, 5, 20, -10, 2.5, 0);

    // Central platform
    const platformGeometry = new THREE.CylinderGeometry(3, 3, 0.2, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFD700,
      metalness: 0.5
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 0.1;
    platform.receiveShadow = true;
    scene.add(platform);
  };

  const createPlayerHand = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    const handGroup = new THREE.Group();
    
    // Arm
    const armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const arm = new THREE.Mesh(armGeometry, skinMaterial);
    arm.position.set(0.4, -0.3, -0.5);
    arm.rotation.x = -0.3;
    handGroup.add(arm);

    // Hand
    const handGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const hand = new THREE.Mesh(handGeometry, skinMaterial);
    hand.position.set(0.4, -0.5, -0.6);
    handGroup.add(hand);

    // Part in hand - FIXED to show correct shape
    const partMesh = createCorrectPartMesh(playerPart);
    partMesh.position.set(0.4, -0.4, -0.7);
    partMesh.scale.set(0.3, 0.3, 0.3);
    handGroup.add(partMesh);

    camera.add(handGroup);
    gameRefs.current.hand = handGroup;
  };

  // Create correct part mesh with proper shapes
  const createCorrectPartMesh = (partType: string): THREE.Group => {
    const group = new THREE.Group();

    switch(partType) {
      case 'chassis':
        // Car frame shape
        const chassisBody = new THREE.BoxGeometry(2, 0.3, 1);
        const chassisMat = new THREE.MeshStandardMaterial({ 
          color: 0xFFA500,
          metalness: 0.3
        });
        const chassisMesh = new THREE.Mesh(chassisBody, chassisMat);
        
        // Add cabin shape
        const cabin = new THREE.BoxGeometry(1, 0.4, 0.8);
        const cabinMesh = new THREE.Mesh(cabin, chassisMat);
        cabinMesh.position.y = 0.35;
        chassisMesh.add(cabinMesh);
        
        group.add(chassisMesh);
        break;

      case 'engine':
        // Engine block with cylinders
        const engineBlock = new THREE.BoxGeometry(0.8, 0.6, 0.8);
        const engineMat = new THREE.MeshStandardMaterial({ 
          color: 0xFF0000,
          metalness: 0.7
        });
        const engineMesh = new THREE.Mesh(engineBlock, engineMat);
        
        // Add cylinders
        const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3);
        for (let i = 0; i < 4; i++) {
          const cylinder = new THREE.Mesh(cylinderGeo, engineMat);
          cylinder.position.set(
            (i % 2) * 0.2 - 0.1,
            0.4,
            Math.floor(i / 2) * 0.2 - 0.1
          );
          engineMesh.add(cylinder);
        }
        
        group.add(engineMesh);
        break;

      case 'gearbox':
        // Gearbox with gears
        const gearboxBody = new THREE.BoxGeometry(0.5, 0.5, 0.7);
        const gearboxMat = new THREE.MeshStandardMaterial({ 
          color: 0x0000FF,
          metalness: 0.5
        });
        const gearboxMesh = new THREE.Mesh(gearboxBody, gearboxMat);
        
        // Add gear
        const gearGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
        const gear = new THREE.Mesh(gearGeo, gearboxMat);
        gear.position.y = 0.3;
        gear.rotation.x = Math.PI / 2;
        gearboxMesh.add(gear);
        
        // Gear stick
        const stickGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3);
        const stick = new THREE.Mesh(stickGeo, gearboxMat);
        stick.position.y = 0.4;
        gearboxMesh.add(stick);
        
        group.add(gearboxMesh);
        break;

      case 'wheel':
        // Realistic wheel
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 32);
        const tireMat = new THREE.MeshStandardMaterial({ 
          color: 0x1a1a1a,
          roughness: 0.9
        });
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.rotation.z = Math.PI / 2;
        
        // Rim
        const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16);
        const rimMat = new THREE.MeshStandardMaterial({ 
          color: 0xC0C0C0,
          metalness: 0.9
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        wheel.add(rim);
        
        // Spokes
        const spokeGeo = new THREE.BoxGeometry(0.4, 0.05, 0.17);
        const spoke1 = new THREE.Mesh(spokeGeo, rimMat);
        const spoke2 = new THREE.Mesh(spokeGeo, rimMat);
        spoke2.rotation.z = Math.PI / 2;
        wheel.add(spoke1);
        wheel.add(spoke2);
        
        group.add(wheel);
        break;
    }

    return group;
  };

  const createOtherPlayers = (scene: THREE.Scene) => {
    console.log('Creating other players with improved models:', players);
    
    // Clear existing
    gameRefs.current.otherPlayers.forEach(group => scene.remove(group));
    gameRefs.current.otherPlayers.clear();

    players.forEach(player => {
      if (player.id !== SocketClient.id && player.isAlive) {
        const playerGroup = new THREE.Group();
        
        // Random color for this player
        const playerColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
        
        // === BODY (Torso) ===
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.25);
        const bodyMat = new THREE.MeshStandardMaterial({ color: playerColor });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.3;
        body.castShadow = true;
        playerGroup.add(body);
        
        // === HEAD ===
        const headGeo = new THREE.SphereGeometry(0.2, 8, 6);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.85;
        head.castShadow = true;
        playerGroup.add(head);
        
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.06, 0.88, 0.18);
        playerGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.06, 0.88, 0.18);
        playerGroup.add(rightEye);
        
        // === ARMS ===
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4);
        const armMat = new THREE.MeshStandardMaterial({ color: playerColor });
        
        const leftArmGroup = new THREE.Group();
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.y = -0.2;
        leftArmGroup.add(leftArm);
        leftArmGroup.position.set(-0.3, 0.5, 0);
        playerGroup.add(leftArmGroup);
        
        const rightArmGroup = new THREE.Group();
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.y = -0.2;
        rightArmGroup.add(rightArm);
        rightArmGroup.position.set(0.3, 0.5, 0);
        playerGroup.add(rightArmGroup);
        
        // === LEGS WITH FEET ===
        const upperLegGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4);
        const lowerLegGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.4);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        
        // Left leg
        const leftLegGroup = new THREE.Group();
        const leftUpperLeg = new THREE.Mesh(upperLegGeo, legMat);
        leftUpperLeg.position.y = -0.2;
        leftLegGroup.add(leftUpperLeg);
        
        const leftLowerLeg = new THREE.Mesh(lowerLegGeo, legMat);
        leftLowerLeg.position.y = -0.6;
        leftLegGroup.add(leftLowerLeg);
        
        // Left foot
        const footGeo = new THREE.BoxGeometry(0.12, 0.06, 0.2);
        const footMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
        const leftFoot = new THREE.Mesh(footGeo, footMat);
        leftFoot.position.set(0, -0.83, 0.05);
        leftLegGroup.add(leftFoot);
        
        leftLegGroup.position.set(-0.12, 0, 0);
        playerGroup.add(leftLegGroup);
        
        // Right leg
        const rightLegGroup = new THREE.Group();
        const rightUpperLeg = new THREE.Mesh(upperLegGeo, legMat);
        rightUpperLeg.position.y = -0.2;
        rightLegGroup.add(rightUpperLeg);
        
        const rightLowerLeg = new THREE.Mesh(lowerLegGeo, legMat);
        rightLowerLeg.position.y = -0.6;
        rightLegGroup.add(rightLowerLeg);
        
        // Right foot
        const rightFoot = new THREE.Mesh(footGeo, footMat);
        rightFoot.position.set(0, -0.83, 0.05);
        rightLegGroup.add(rightFoot);
        
        rightLegGroup.position.set(0.12, 0, 0);
        playerGroup.add(rightLegGroup);
        
        // === PART INDICATOR (Fixed to show correct shape) ===
        if (player.part) {
          const partIndicator = createCorrectPartMesh(player.part);
          partIndicator.scale.set(0.15, 0.15, 0.15);
          partIndicator.position.set(0, 0.3, 0.2);
          playerGroup.add(partIndicator);
        }
        
        // === NAME PLATE ===
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0, 'rgba(0,0,0,0.7)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.9)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 64);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.name, 128, 25);
        
        if (player.part === 'chassis') {
          ctx.fillStyle = '#FFD700';
          ctx.font = '18px Arial';
          ctx.fillText('👑 القائد', 128, 45);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ 
          map: texture,
          depthTest: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 1.3;
        playerGroup.add(sprite);
        
        // Set position
        const pos = player.position || { 
          x: Math.random() * 10 - 5, 
          y: 0.8, 
          z: Math.random() * 10 - 5 
        };
        playerGroup.position.set(pos.x, 0.85, pos.z);
        
        scene.add(playerGroup);
        gameRefs.current.otherPlayers.set(player.id, playerGroup);
      }
    });
  };

  const updateOtherPlayersVisuals = () => {
    if (!gameRefs.current.scene) return;
    players.forEach(player => {
      if (player.id !== SocketClient.id && player.isAlive) {
        if (!gameRefs.current.otherPlayers.has(player.id)) {
          createOtherPlayers(gameRefs.current.scene!);
        }
      }
    });
  };

  const setupControls = (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      setIsLocked(locked);
      console.log('Pointer lock:', locked);
    };
    
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    renderer.domElement.addEventListener('click', () => {
      renderer.domElement.requestPointerLock();
    });
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      
      const sensitivity = 0.002;
      playerState.current.rotation.y -= e.movementX * sensitivity;
      playerState.current.rotation.x -= e.movementY * sensitivity;
      playerState.current.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, playerState.current.rotation.x));
      
      camera.rotation.order = 'YXZ';
      camera.rotation.y = playerState.current.rotation.y;
      camera.rotation.x = playerState.current.rotation.x;
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
          playerState.current.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          playerState.current.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          playerState.current.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          playerState.current.keys.right = true;
          break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
          playerState.current.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          playerState.current.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          playerState.current.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          playerState.current.keys.right = false;
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  };

  const setupSocketEvents = (scene: THREE.Scene) => {
    SocketClient.on('player-moved', ({ playerId, position, rotation }) => {
      const playerGroup = gameRefs.current.otherPlayers.get(playerId);
      if (playerGroup) {
        playerGroup.position.lerp(new THREE.Vector3(position.x, 0.85, position.z), 0.3);
        playerGroup.rotation.y = rotation.y;
        
        // Walking animation
        const isMoving = Math.abs(position.x - playerGroup.position.x) > 0.01 || 
                        Math.abs(position.z - playerGroup.position.z) > 0.01;
        
        if (isMoving) {
          const time = Date.now() * 0.003;
          const legSwing = Math.sin(time * 8) * 0.15;
          const armSwing = Math.sin(time * 8) * 0.1;
          
          // Animate legs (indices 4 and 5)
          if (playerGroup.children[4]) playerGroup.children[4].rotation.x = legSwing;
          if (playerGroup.children[5]) playerGroup.children[5].rotation.x = -legSwing;
          
          // Animate arms (indices 2 and 3)
          if (playerGroup.children[2]) playerGroup.children[2].rotation.x = -armSwing;
          if (playerGroup.children[3]) playerGroup.children[3].rotation.x = armSwing;
        }
      }
    });

    SocketClient.on('player-joined', (player: any) => {
      console.log('Player joined:', player.name);
      if (player.id !== SocketClient.id) {
        createOtherPlayers(scene);
      }
    });

    SocketClient.on('player-left', ({ playerId }) => {
      const playerGroup = gameRefs.current.otherPlayers.get(playerId);
      if (playerGroup) {
        scene.remove(playerGroup);
        gameRefs.current.otherPlayers.delete(playerId);
      }
    });
  };

  const animate = () => {
    gameRefs.current.animationId = requestAnimationFrame(animate);
    
    const delta = gameRefs.current.clock.getDelta();
    const camera = gameRefs.current.camera;
    const hand = gameRefs.current.hand;
    
    if (!camera) return;
    
    // Update movement
    const speed = 5;
    const keys = playerState.current.keys;
    
    const moveX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const moveZ = (keys.backward ? 1 : 0) - (keys.forward ? 1 : 0);
    
    if (moveX !== 0 || moveZ !== 0) {
      const angle = Math.atan2(moveX, moveZ);
      const moveAngle = playerState.current.rotation.y + angle;
      
      playerState.current.velocity.x = Math.sin(moveAngle) * speed * delta;
      playerState.current.velocity.z = Math.cos(moveAngle) * speed * delta;
      
      playerState.current.position.x += playerState.current.velocity.x;
      playerState.current.position.z += playerState.current.velocity.z;
      
      playerState.current.position.x = Math.max(-9, Math.min(9, playerState.current.position.x));
      playerState.current.position.z = Math.max(-9, Math.min(9, playerState.current.position.z));
      
      camera.position.x = playerState.current.position.x;
      camera.position.z = playerState.current.position.z;
      
      sendPositionUpdate();
      
      if (hand) {
        const time = gameRefs.current.clock.getElapsedTime();
        hand.position.y = -0.3 + Math.sin(time * 10) * 0.02;
      }
    }
    
    // Check nearby players for proximity voice
    checkNearbyPlayers();
    
    if (gameRefs.current.renderer && gameRefs.current.scene) {
      gameRefs.current.renderer.render(gameRefs.current.scene, camera);
    }
  };

  const checkNearbyPlayers = () => {
    if (!gameRefs.current.camera) return;
    
    const playerPos = gameRefs.current.camera.position;
    let closest: any = null;
    let minDistance = 3; // Max distance for voice chat
    
    gameRefs.current.otherPlayers.forEach((group, id) => {
      const distance = playerPos.distanceTo(group.position);
      if (distance < minDistance) {
        minDistance = distance;
        const playerData = players.find(p => p.id === id);
        if (playerData) {
          closest = { ...playerData, distance };
        }
      }
    });
    
    setNearbyPlayer(closest);
    
    // Send nearby player update to parent component
    SocketClient.emit('nearby-player-update', closest);
    
    // Send proximity info to voice chat
    if (closest) {
      SocketClient.emit('proximity-voice', {
        roomId,
        targetId: closest.id,
        distance: closest.distance
      });
    }
  };

  const sendPositionUpdate = () => {
    const now = Date.now();
    if (!playerState.current.lastUpdate || now - playerState.current.lastUpdate > 50) {
      SocketClient.emit('player-move', {
        roomId,
        position: playerState.current.position,
        rotation: { y: playerState.current.rotation.y }
      });
      playerState.current.lastUpdate = now;
    }
  };

  const handleResize = () => {
    const camera = gameRefs.current.camera;
    const renderer = gameRefs.current.renderer;
    if (camera && renderer) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  };

  const cleanup = () => {
    console.log('Cleaning up game...');
    if (gameRefs.current.animationId) {
      cancelAnimationFrame(gameRefs.current.animationId);
    }
    if (gameRefs.current.renderer && mountRef.current) {
      mountRef.current.removeChild(gameRefs.current.renderer.domElement);
      gameRefs.current.renderer.dispose();
    }
    window.removeEventListener('resize', handleResize);
    SocketClient.off('player-moved');
    SocketClient.off('player-joined');
    SocketClient.off('player-left');
  };

  const getPartName = (part: string): string => {
    const names: Record<string, string> = {
      chassis: '🏗️ الهيكل',
      engine: '⚙️ المحرك', 
      gearbox: '🔧 القير',
      wheel: '🛞 الدولاب'
    };
    return names[part] || part;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      
      {!isLocked && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-black/50 text-white px-6 py-3 rounded-lg text-center">
            <p className="text-xl font-bold mb-2">انقر لبدء اللعب</p>
            <p className="text-sm">WASD للحركة - Mouse للنظر</p>
          </div>
        </div>
      )}
      
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-black/50 backdrop-blur text-white p-4 rounded-lg">
          <p className="text-xl font-bold">{playerName}</p>
          <p>{getPartName(playerPart)}</p>
          {isLeader && <p className="text-yellow-400">👑 القائد</p>}
        </div>
      </div>
      
      {nearbyPlayer && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <div className="bg-green-500/80 text-white px-4 py-2 rounded-lg animate-pulse">
            <p className="text-sm">🎤 قريب من: {nearbyPlayer.name}</p>
            <p className="text-xs">المسافة: {nearbyPlayer.distance.toFixed(1)}م - اضغط V للتحدث معه فقط</p>
          </div>
        </div>
      )}
      
      {isLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-8 h-0.5 bg-white"></div>
          <div className="w-0.5 h-8 bg-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      )}
    </div>
  );
}