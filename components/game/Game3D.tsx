// =====================================
// 📁 components/game/Game3D.tsx - Fixed Realistic Characters
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
    otherPlayers: new Map<string, any>(),
    animationId: null as number | null
  });

  // Player state
  const playerState = useRef({
    position: { x: 0, y: 1.6, z: 5 },
    rotation: { x: 0, y: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isGrounded: true,
    isJumping: false,
    isWalking: false,
    isRunning: false,
    walkCycle: 0,
    lastUpdate: 0,
    keys: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      space: false
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
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mountRef.current!.appendChild(renderer.domElement);
    gameRefs.current.renderer = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x545454, 0.4);
    scene.add(hemiLight);

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
    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3a5f3a,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8B7355,
      roughness: 0.9
    });
    
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

    createWall(30, 5, 0.5, 0, 2.5, -15);
    createWall(30, 5, 0.5, 0, 2.5, 15);
    createWall(0.5, 5, 30, 15, 2.5, 0);
    createWall(0.5, 5, 30, -15, 2.5, 0);

    // Central platform
    const platformGeometry = new THREE.CylinderGeometry(3, 3, 0.3, 64);
    const platformMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFD700,
      metalness: 0.7,
      roughness: 0.3
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 0.15;
    platform.castShadow = true;
    platform.receiveShadow = true;
    scene.add(platform);

    // Decorative pillars
    for(let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 3, 16),
        new THREE.MeshStandardMaterial({ color: 0x666666 })
      );
      pillar.position.set(Math.cos(angle) * 8, 1.5, Math.sin(angle) * 8);
      pillar.castShadow = true;
      scene.add(pillar);
    }
  };

  const createPlayerHand = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    const handGroup = new THREE.Group();
    
    // Arm
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 12);
    const skinMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffdbac,
      roughness: 0.7
    });
    const arm = new THREE.Mesh(armGeometry, skinMaterial);
    arm.position.set(0.4, -0.3, -0.5);
    arm.rotation.x = -0.3;
    arm.rotation.z = 0.1;
    arm.castShadow = true;
    handGroup.add(arm);

    // Hand
    const handGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.08);
    const hand = new THREE.Mesh(handGeometry, skinMaterial);
    hand.position.set(0.4, -0.5, -0.6);
    hand.rotation.x = -0.2;
    handGroup.add(hand);

    // Fingers
    for(let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6),
        skinMaterial
      );
      finger.position.set(0.35 + i * 0.03, -0.58, -0.62);
      finger.rotation.x = -0.3;
      handGroup.add(finger);
    }

    // Thumb
    const thumb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6),
      skinMaterial
    );
    thumb.position.set(0.45, -0.52, -0.58);
    thumb.rotation.z = 0.5;
    handGroup.add(thumb);

    // Part in hand
    const partMesh = createPartMesh(playerPart);
    partMesh.position.set(0.4, -0.4, -0.7);
    partMesh.scale.set(0.25, 0.25, 0.25);
    handGroup.add(partMesh);

    camera.add(handGroup);
    gameRefs.current.hand = handGroup;
  };

  const createPartMesh = (partType: string): THREE.Group => {
    const group = new THREE.Group();

    switch(partType) {
      case 'chassis':
        const chassisBody = new THREE.BoxGeometry(2, 0.3, 1);
        const chassisMat = new THREE.MeshStandardMaterial({ 
          color: 0xFFA500,
          metalness: 0.6,
          roughness: 0.4
        });
        const chassisMesh = new THREE.Mesh(chassisBody, chassisMat);
        
        const cabin = new THREE.BoxGeometry(1, 0.4, 0.8);
        const cabinMesh = new THREE.Mesh(cabin, chassisMat);
        cabinMesh.position.y = 0.35;
        chassisMesh.add(cabinMesh);
        
        group.add(chassisMesh);
        break;

      case 'engine':
        const engineBlock = new THREE.BoxGeometry(0.8, 0.6, 0.8);
        const engineMat = new THREE.MeshStandardMaterial({ 
          color: 0xCC0000,
          metalness: 0.9,
          roughness: 0.3
        });
        const engineMesh = new THREE.Mesh(engineBlock, engineMat);
        
        const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 12);
        for (let i = 0; i < 4; i++) {
          const cylinder = new THREE.Mesh(cylinderGeo, engineMat);
          cylinder.position.set(
            (i % 2) * 0.25 - 0.125,
            0.4,
            Math.floor(i / 2) * 0.25 - 0.125
          );
          engineMesh.add(cylinder);
        }
        
        group.add(engineMesh);
        break;

      case 'gearbox':
        const gearboxBody = new THREE.BoxGeometry(0.5, 0.5, 0.7);
        const gearboxMat = new THREE.MeshStandardMaterial({ 
          color: 0x0066CC,
          metalness: 0.7,
          roughness: 0.4
        });
        const gearboxMesh = new THREE.Mesh(gearboxBody, gearboxMat);
        
        const gearGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
        const gear = new THREE.Mesh(gearGeo, gearboxMat);
        gear.position.y = 0.3;
        gear.rotation.x = Math.PI / 2;
        gearboxMesh.add(gear);
        
        group.add(gearboxMesh);
        break;

      case 'wheel':
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 32);
        const tireMat = new THREE.MeshStandardMaterial({ 
          color: 0x1a1a1a,
          roughness: 0.95,
          metalness: 0.1
        });
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.rotation.z = Math.PI / 2;
        
        const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16);
        const rimMat = new THREE.MeshStandardMaterial({ 
          color: 0xDDDDDD,
          metalness: 0.95,
          roughness: 0.1
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        wheel.add(rim);
        
        group.add(wheel);
        break;
    }

    return group;
  };

  // FIXED: Properly proportioned character
  const createRealisticCharacter = (player: any): THREE.Group => {
    const characterGroup = new THREE.Group();
    
    // Character colors
    const skinTone = 0xffdbac;
    const clothingColor = new THREE.Color().setHSL(Math.random(), 0.6, 0.4);
    
    const skinMat = new THREE.MeshStandardMaterial({ 
      color: skinTone,
      roughness: 0.7
    });
    
    const clothMat = new THREE.MeshStandardMaterial({ 
      color: clothingColor,
      roughness: 0.8
    });
    
    // === BODY (Fixed proportions) ===
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.6, 0.2);
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.position.y = 0.5; // Fixed position from ground
    body.castShadow = true;
    body.receiveShadow = true;
    characterGroup.add(body);
    
    // === HEAD (Fixed position) ===
    const headGeo = new THREE.SphereGeometry(0.12, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.95; // Fixed position
    head.scale.y = 1.2; // Slightly elongated
    head.castShadow = true;
    characterGroup.add(head);
    
    // === FACE FEATURES (Simplified) ===
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.02, 6, 4);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.04, 0.97, 0.1);
    characterGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.04, 0.97, 0.1);
    characterGroup.add(rightEye);
    
    // === ARMS (Fixed to body) ===
    // Left Arm Group
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.25, 0.7, 0); // Fixed to shoulder
    
    const leftUpperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.25, 8),
      clothMat
    );
    leftUpperArm.position.y = -0.125;
    leftArmGroup.add(leftUpperArm);
    
    const leftLowerArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.25, 8),
      skinMat
    );
    leftLowerArm.position.y = -0.375;
    leftArmGroup.add(leftLowerArm);
    
    leftArmGroup.userData = { type: 'leftArm', side: -1 };
    characterGroup.add(leftArmGroup);
    
    // Right Arm Group
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.25, 0.7, 0); // Fixed to shoulder
    
    const rightUpperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.25, 8),
      clothMat
    );
    rightUpperArm.position.y = -0.125;
    rightArmGroup.add(rightUpperArm);
    
    const rightLowerArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.25, 8),
      skinMat
    );
    rightLowerArm.position.y = -0.375;
    rightArmGroup.add(rightLowerArm);
    
    rightArmGroup.userData = { type: 'rightArm', side: 1 };
    characterGroup.add(rightArmGroup);
    
    // === LEGS (Fixed to body) ===
    // Left Leg Group
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, 0.2, 0); // Fixed to hip
    
    const leftThigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.35, 8),
      clothMat
    );
    leftThigh.position.y = -0.175;
    leftLegGroup.add(leftThigh);
    
    const leftShin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8),
      clothMat
    );
    leftShin.position.y = -0.525;
    leftLegGroup.add(leftShin);
    
    // Foot
    const leftFoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.05, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    leftFoot.position.set(0, -0.725, 0.03);
    leftLegGroup.add(leftFoot);
    
    leftLegGroup.userData = { type: 'leftLeg', side: -1 };
    characterGroup.add(leftLegGroup);
    
    // Right Leg Group
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, 0.2, 0); // Fixed to hip
    
    const rightThigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.35, 8),
      clothMat
    );
    rightThigh.position.y = -0.175;
    rightLegGroup.add(rightThigh);
    
    const rightShin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8),
      clothMat
    );
    rightShin.position.y = -0.525;
    rightLegGroup.add(rightShin);
    
    // Foot
    const rightFoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.05, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    rightFoot.position.set(0, -0.725, 0.03);
    rightLegGroup.add(rightFoot);
    
    rightLegGroup.userData = { type: 'rightLeg', side: 1 };
    characterGroup.add(rightLegGroup);
    
    // === HAIR (Simple) ===
    const hairMat = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.9
    });
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      hairMat
    );
    hair.position.y = 1;
    hair.scale.y = 0.7;
    characterGroup.add(hair);
    
    // === PART INDICATOR ===
    if (player.part) {
      const partIndicator = createPartMesh(player.part);
      partIndicator.scale.set(0.1, 0.1, 0.1);
      partIndicator.position.set(0, 0.5, -0.15);
      characterGroup.add(partIndicator);
    }
    
    // === NAME PLATE ===
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name, 128, 32);
    
    if (player.part === 'chassis') {
      ctx.fillStyle = '#FFD700';
      ctx.font = '16px Arial';
      ctx.fillText('👑 القائد', 128, 48);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.5, 0.375, 1);
    sprite.position.y = 1.3;
    characterGroup.add(sprite);
    
    return characterGroup;
  };

  const createOtherPlayers = (scene: THREE.Scene) => {
    console.log('Creating realistic characters for players:', players);
    
    // Clear existing
    gameRefs.current.otherPlayers.forEach(data => {
      scene.remove(data.group);
    });
    gameRefs.current.otherPlayers.clear();

    players.forEach(player => {
      if (player.id !== SocketClient.id && player.isAlive) {
        const character = createRealisticCharacter(player);
        
        // FIXED: Set position on ground level
        const pos = player.position || { 
          x: Math.random() * 10 - 5, 
          y: 0, 
          z: Math.random() * 10 - 5 
        };
        character.position.set(pos.x, 0.75, pos.z); // Fixed height
        
        scene.add(character);
        gameRefs.current.otherPlayers.set(player.id, {
          group: character,
          walkCycle: 0,
          isWalking: false,
          isRunning: false,
          targetPosition: new THREE.Vector3(pos.x, 0.75, pos.z),
          targetRotation: 0
        });
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
      playerState.current.rotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, playerState.current.rotation.x));
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
        case 'ShiftLeft':
        case 'ShiftRight':
          playerState.current.keys.shift = true;
          break;
        case 'Space':
          if(playerState.current.isGrounded && !playerState.current.isJumping) {
            playerState.current.velocity.y = 8;
            playerState.current.isGrounded = false;
            playerState.current.isJumping = true;
          }
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
        case 'ShiftLeft':
        case 'ShiftRight':
          playerState.current.keys.shift = false;
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  };

  const setupSocketEvents = (scene: THREE.Scene) => {
    SocketClient.on('player-moved', ({ playerId, position, rotation, isRunning, isJumping }) => {
      const playerData = gameRefs.current.otherPlayers.get(playerId);
      if (playerData) {
        // Update target position
        playerData.targetPosition = new THREE.Vector3(
          position.x, 
          0.75, // Fixed height
          position.z
        );
        playerData.targetRotation = rotation.y;
        playerData.isRunning = isRunning || false;
        playerData.isJumping = isJumping || false;
        
        // Check if moving
        const distance = Math.sqrt(
          Math.pow(position.x - playerData.group.position.x, 2) + 
          Math.pow(position.z - playerData.group.position.z, 2)
        );
        playerData.isWalking = distance > 0.01;
      }
    });

    SocketClient.on('player-joined', (player: any) => {
      console.log('Player joined:', player.name);
      if (player.id !== SocketClient.id) {
        createOtherPlayers(scene);
      }
    });

    SocketClient.on('player-left', ({ playerId }) => {
      const playerData = gameRefs.current.otherPlayers.get(playerId);
      if (playerData) {
        scene.remove(playerData.group);
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
    
    // Movement physics
    const keys = playerState.current.keys;
    const baseSpeed = keys.shift ? 12 : 7; // Increased speeds
    
    const moveX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const moveZ = (keys.backward ? 1 : 0) - (keys.forward ? 1 : 0);
    
    // Update movement
    if (moveX !== 0 || moveZ !== 0) {
      const angle = Math.atan2(moveX, moveZ);
      const moveAngle = playerState.current.rotation.y + angle;
      
      playerState.current.velocity.x = Math.sin(moveAngle) * baseSpeed;
      playerState.current.velocity.z = Math.cos(moveAngle) * baseSpeed;
      playerState.current.isWalking = true;
      playerState.current.isRunning = keys.shift;
    } else {
      playerState.current.velocity.x *= 0.85;
      playerState.current.velocity.z *= 0.85;
      playerState.current.isWalking = false;
      playerState.current.isRunning = false;
    }
    
    // Gravity for jumping
    if (!playerState.current.isGrounded) {
      playerState.current.velocity.y -= 20 * delta;
    }
    
    // Update position
    playerState.current.position.x += playerState.current.velocity.x * delta;
    playerState.current.position.z += playerState.current.velocity.z * delta;
    playerState.current.position.y += playerState.current.velocity.y * delta;
    
    // Ground collision
    if (playerState.current.position.y <= 1.6) {
      playerState.current.position.y = 1.6;
      playerState.current.velocity.y = 0;
      playerState.current.isGrounded = true;
      playerState.current.isJumping = false;
    }
    
    // Boundaries
    playerState.current.position.x = Math.max(-14, Math.min(14, playerState.current.position.x));
    playerState.current.position.z = Math.max(-14, Math.min(14, playerState.current.position.z));
    
    // Update camera
    camera.position.x = playerState.current.position.x;
    camera.position.y = playerState.current.position.y;
    camera.position.z = playerState.current.position.z;
    
    camera.rotation.order = 'YXZ';
    camera.rotation.y = playerState.current.rotation.y;
    camera.rotation.x = playerState.current.rotation.x;
    
    // Walking bobbing
    if (playerState.current.isWalking) {
      playerState.current.walkCycle += delta * (playerState.current.isRunning ? 10 : 6);
      const bobAmount = playerState.current.isRunning ? 0.06 : 0.04;
      const bobY = Math.abs(Math.sin(playerState.current.walkCycle)) * bobAmount;
      camera.position.y += bobY;
      
      if (hand) {
        hand.position.y = -0.3 + bobY;
        hand.rotation.z = Math.sin(playerState.current.walkCycle) * 0.05;
      }
    } else {
      // Reset camera tilt
      camera.rotation.z *= 0.95;
    }
    
    // FIXED: Smooth animation for other players
    gameRefs.current.otherPlayers.forEach((playerData) => {
      // Smooth position interpolation
      if (playerData.targetPosition) {
        playerData.group.position.lerp(playerData.targetPosition, 0.2);
      }
      
      // Smooth rotation
      if (playerData.targetRotation !== undefined) {
        const diff = playerData.targetRotation - playerData.group.rotation.y;
        playerData.group.rotation.y += diff * 0.2;
      }
      
      // Walking/Running animation (only when actually moving)
      if (playerData.isWalking) {
        playerData.walkCycle += delta * (playerData.isRunning ? 10 : 6);
        
        // Find leg groups
        const leftLeg = playerData.group.children.find((c: any) => 
          c.userData && c.userData.type === 'leftLeg'
        );
        const rightLeg = playerData.group.children.find((c: any) => 
          c.userData && c.userData.type === 'rightLeg'
        );
        
        // Animate legs with proper swing
        if (leftLeg && rightLeg) {
          const swingAmount = playerData.isRunning ? 0.5 : 0.3;
          leftLeg.rotation.x = Math.sin(playerData.walkCycle) * swingAmount;
          rightLeg.rotation.x = -Math.sin(playerData.walkCycle) * swingAmount;
        }
        
        // Find arm groups
        const leftArm = playerData.group.children.find((c: any) => 
          c.userData && c.userData.type === 'leftArm'
        );
        const rightArm = playerData.group.children.find((c: any) => 
          c.userData && c.userData.type === 'rightArm'
        );
        
        // Animate arms (opposite to legs)
        if (leftArm && rightArm) {
          const swingAmount = playerData.isRunning ? 0.4 : 0.2;
          leftArm.rotation.x = -Math.sin(playerData.walkCycle) * swingAmount;
          rightArm.rotation.x = Math.sin(playerData.walkCycle) * swingAmount;
        }
        
        // Slight body bob (reduced)
        const bobAmount = playerData.isRunning ? 0.02 : 0.01;
        playerData.group.position.y = 0.75 + Math.abs(Math.sin(playerData.walkCycle * 2)) * bobAmount;
      } else {
        // Return limbs to rest position when not walking
        playerData.group.children.forEach((child: any) => {
          if (child.userData && child.userData.type && child.rotation) {
            child.rotation.x *= 0.9; // Smooth return to zero
          }
        });
        // Return to ground level
        playerData.group.position.y = 0.75;
      }
    });
    
    // Check nearby players
    checkNearbyPlayers();
    
    // Send position update
    sendPositionUpdate();
    
    if (gameRefs.current.renderer && gameRefs.current.scene) {
      gameRefs.current.renderer.render(gameRefs.current.scene, camera);
    }
  };

  const checkNearbyPlayers = () => {
    if (!gameRefs.current.camera) return;
    
    const playerPos = gameRefs.current.camera.position;
    let closest: any = null;
    let minDistance = 3;
    
    gameRefs.current.otherPlayers.forEach((data, id) => {
      const distance = playerPos.distanceTo(data.group.position);
      if (distance < minDistance) {
        minDistance = distance;
        const playerData = players.find(p => p.id === id);
        if (playerData) {
          closest = { ...playerData, distance };
        }
      }
    });
    
    setNearbyPlayer(closest);
    
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
        rotation: { y: playerState.current.rotation.y },
        isRunning: playerState.current.isRunning,
        isJumping: playerState.current.isJumping
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
          <div className="bg-black/70 backdrop-blur text-white px-6 py-4 rounded-xl text-center">
            <p className="text-2xl font-bold mb-3">🎮 انقر لبدء اللعب</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>⬆️ W - للأمام</div>
              <div>⬇️ S - للخلف</div>
              <div>⬅️ A - يسار</div>
              <div>➡️ D - يمين</div>
              <div>🏃 Shift - الجري</div>
              <div>🦘 Space - القفز</div>
              <div>🖱️ Mouse - النظر</div>
              <div>🎤 V - التحدث الخاص</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-black/60 backdrop-blur text-white p-4 rounded-xl">
          <p className="text-xl font-bold">{playerName}</p>
          <p className="text-sm">{getPartName(playerPart)}</p>
          {isLeader && <p className="text-yellow-400">👑 القائد</p>}
          {playerState.current.isRunning && (
            <p className="text-green-400 text-xs animate-pulse">🏃 جري سريع</p>
          )}
          {playerState.current.isJumping && (
            <p className="text-blue-400 text-xs">🦘 يقفز</p>
          )}
        </div>
      </div>
      
      {nearbyPlayer && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <div className="bg-gradient-to-r from-green-500/80 to-emerald-600/80 backdrop-blur text-white px-6 py-3 rounded-xl animate-pulse shadow-xl">
            <p className="text-sm font-bold">🎤 قريب من: {nearbyPlayer.name}</p>
            <p className="text-xs">المسافة: {nearbyPlayer.distance.toFixed(1)}م</p>
            <p className="text-xs mt-1">اضغط واستمر V للمحادثة الخاصة</p>
          </div>
        </div>
      )}
      
      {isLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="relative">
            <div className="w-10 h-0.5 bg-white/80 shadow-lg"></div>
            <div className="w-0.5 h-10 bg-white/80 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
            <div className="w-4 h-4 border-2 border-white/50 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
        </div>
      )}
    </div>
  );
}