// =====================================
// 📁 components/game/Game3D.tsx - Improved Realistic Characters & Movement
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

  // Player state with realistic physics
  const playerState = useRef({
    position: { x: 0, y: 1.6, z: 5 },
    rotation: { x: 0, y: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, z: 0 },
    isGrounded: true,
    isWalking: false,
    walkCycle: 0,
    bobAmount: 0,
    lastUpdate: 0,
    keys: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false, // For running
      space: false  // For jumping
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

    // Renderer with better quality
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

    // Enhanced Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // Add hemisphere light for better ambient
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
    // Textured Ground
    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    const groundTexture = new THREE.TextureLoader().load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
    groundTexture.repeat.set(30, 30);
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    
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

    // Walls with texture
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

    // Enhanced Central platform
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

    // Add some decorative elements
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
    
    // Realistic Arm
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

    // Realistic Hand
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
    const partMesh = createRealisticPartMesh(playerPart);
    partMesh.position.set(0.4, -0.4, -0.7);
    partMesh.scale.set(0.25, 0.25, 0.25);
    handGroup.add(partMesh);

    camera.add(handGroup);
    gameRefs.current.hand = handGroup;
  };

  // Create more realistic part meshes
  const createRealisticPartMesh = (partType: string): THREE.Group => {
    const group = new THREE.Group();

    switch(partType) {
      case 'chassis':
        // Detailed car frame
        const chassisGroup = new THREE.Group();
        
        // Main body
        const bodyShape = new THREE.Shape();
        bodyShape.moveTo(-1, 0);
        bodyShape.lineTo(1, 0);
        bodyShape.lineTo(0.8, 0.3);
        bodyShape.lineTo(-0.8, 0.3);
        
        const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, {
          depth: 0.5,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.05
        });
        
        const chassisMat = new THREE.MeshStandardMaterial({ 
          color: 0xFFA500,
          metalness: 0.6,
          roughness: 0.4
        });
        const chassisMesh = new THREE.Mesh(bodyGeometry, chassisMat);
        chassisGroup.add(chassisMesh);
        
        // Cabin
        const cabinGeo = new THREE.BoxGeometry(0.8, 0.4, 0.6);
        const cabin = new THREE.Mesh(cabinGeo, chassisMat);
        cabin.position.y = 0.4;
        chassisGroup.add(cabin);
        
        // Windows
        const windowMat = new THREE.MeshStandardMaterial({ 
          color: 0x333333,
          metalness: 0.8,
          roughness: 0.1
        });
        const windowGeo = new THREE.BoxGeometry(0.7, 0.2, 0.55);
        const windows = new THREE.Mesh(windowGeo, windowMat);
        windows.position.y = 0.45;
        chassisGroup.add(windows);
        
        group.add(chassisGroup);
        break;

      case 'engine':
        // Detailed engine block
        const engineGroup = new THREE.Group();
        
        const engineBlock = new THREE.BoxGeometry(0.8, 0.6, 0.8);
        const engineMat = new THREE.MeshStandardMaterial({ 
          color: 0xCC0000,
          metalness: 0.9,
          roughness: 0.3
        });
        const engineMesh = new THREE.Mesh(engineBlock, engineMat);
        engineGroup.add(engineMesh);
        
        // Cylinders with pistons
        const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 12);
        for (let i = 0; i < 4; i++) {
          const cylinder = new THREE.Mesh(cylinderGeo, engineMat);
          cylinder.position.set(
            (i % 2) * 0.25 - 0.125,
            0.4,
            Math.floor(i / 2) * 0.25 - 0.125
          );
          engineGroup.add(cylinder);
          
          // Piston
          const piston = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8),
            new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 1 })
          );
          piston.position.copy(cylinder.position);
          piston.position.y += 0.15;
          engineGroup.add(piston);
        }
        
        // Exhaust pipes
        const exhaustGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8);
        const exhaustMat = new THREE.MeshStandardMaterial({ 
          color: 0x444444,
          metalness: 0.9
        });
        for(let i = 0; i < 2; i++) {
          const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
          exhaust.rotation.z = Math.PI / 2;
          exhaust.position.set(0.5, i * 0.15 - 0.1, 0);
          engineGroup.add(exhaust);
        }
        
        group.add(engineGroup);
        break;

      case 'gearbox':
        // Detailed gearbox
        const gearboxGroup = new THREE.Group();
        
        // Main housing
        const housingGeo = new THREE.BoxGeometry(0.5, 0.5, 0.7);
        const gearboxMat = new THREE.MeshStandardMaterial({ 
          color: 0x0066CC,
          metalness: 0.7,
          roughness: 0.4
        });
        const housing = new THREE.Mesh(housingGeo, gearboxMat);
        gearboxGroup.add(housing);
        
        // Gears (visible through "window")
        const gearMat = new THREE.MeshStandardMaterial({ 
          color: 0xCCCCCC,
          metalness: 0.95,
          roughness: 0.2
        });
        
        for(let i = 0; i < 3; i++) {
          const gearOuter = new THREE.TorusGeometry(0.12 - i*0.03, 0.02, 4, 16);
          const gear = new THREE.Mesh(gearOuter, gearMat);
          gear.position.y = 0.3;
          gear.position.z = i * 0.1 - 0.1;
          gear.rotation.x = Math.PI / 2;
          gearboxGroup.add(gear);
          
          // Gear teeth
          for(let j = 0; j < 8; j++) {
            const tooth = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.04, 0.02),
              gearMat
            );
            const angle = (j / 8) * Math.PI * 2;
            tooth.position.x = Math.cos(angle) * (0.12 - i*0.03);
            tooth.position.z = Math.sin(angle) * (0.12 - i*0.03) + i * 0.1 - 0.1;
            tooth.position.y = 0.3;
            gearboxGroup.add(tooth);
          }
        }
        
        // Shift lever
        const leverGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.25, 8);
        const lever = new THREE.Mesh(leverGeo, gearboxMat);
        lever.position.y = 0.45;
        lever.rotation.z = 0.2;
        gearboxGroup.add(lever);
        
        // Lever knob
        const knobGeo = new THREE.SphereGeometry(0.05, 12, 8);
        const knob = new THREE.Mesh(knobGeo, 
          new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        knob.position.y = 0.58;
        knob.position.x = 0.05;
        gearboxGroup.add(knob);
        
        group.add(gearboxGroup);
        break;

      case 'wheel':
        // Ultra-realistic wheel
        const wheelGroup = new THREE.Group();
        
        // Tire with tread pattern
        const tireGeo = new THREE.TorusGeometry(0.35, 0.12, 8, 24);
        const tireMat = new THREE.MeshStandardMaterial({ 
          color: 0x1a1a1a,
          roughness: 0.95,
          metalness: 0.1
        });
        const tire = new THREE.Mesh(tireGeo, tireMat);
        wheelGroup.add(tire);
        
        // Tread pattern
        for(let i = 0; i < 16; i++) {
          const tread = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.02, 0.24),
            tireMat
          );
          const angle = (i / 16) * Math.PI * 2;
          tread.position.x = Math.cos(angle) * 0.35;
          tread.position.z = Math.sin(angle) * 0.35;
          tread.rotation.y = angle;
          wheelGroup.add(tread);
        }
        
        // Rim
        const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 32);
        const rimMat = new THREE.MeshStandardMaterial({ 
          color: 0xDDDDDD,
          metalness: 0.95,
          roughness: 0.1
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.z = Math.PI / 2;
        wheelGroup.add(rim);
        
        // Spokes (5-spoke design)
        for(let i = 0; i < 5; i++) {
          const spokeGeo = new THREE.BoxGeometry(0.35, 0.05, 0.12);
          const spoke = new THREE.Mesh(spokeGeo, rimMat);
          spoke.rotation.y = (i / 5) * Math.PI * 2;
          wheelGroup.add(spoke);
        }
        
        // Center cap
        const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16);
        const cap = new THREE.Mesh(capGeo, 
          new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            metalness: 0.8
          })
        );
        cap.rotation.z = Math.PI / 2;
        wheelGroup.add(cap);
        
        // Valve stem
        const valveGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.03, 6);
        const valve = new THREE.Mesh(valveGeo, 
          new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        valve.position.set(0.3, 0, 0);
        valve.rotation.z = Math.PI / 2;
        wheelGroup.add(valve);
        
        group.add(wheelGroup);
        break;
    }

    return group;
  };

  // Create realistic humanoid characters
  const createRealisticCharacter = (player: any): THREE.Group => {
    const characterGroup = new THREE.Group();
    characterGroup.userData = { 
      animations: {},
      mixer: new THREE.AnimationMixer(characterGroup)
    };
    
    // Character colors based on player
    const skinTone = new THREE.Color().setHSL(0.05, 0.5, 0.65 + Math.random() * 0.15);
    const clothingColor = new THREE.Color().setHSL(Math.random(), 0.6, 0.4);
    
    const skinMat = new THREE.MeshStandardMaterial({ 
      color: skinTone,
      roughness: 0.7
    });
    
    const clothMat = new THREE.MeshStandardMaterial({ 
      color: clothingColor,
      roughness: 0.8
    });
    
    // === TORSO (with realistic shape) ===
    const torsoShape = new THREE.Shape();
    torsoShape.moveTo(-0.25, 0);
    torsoShape.lineTo(0.25, 0);
    torsoShape.lineTo(0.2, 0.6);
    torsoShape.lineTo(-0.2, 0.6);
    
    const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05
    });
    
    const torso = new THREE.Mesh(torsoGeo, clothMat);
    torso.position.y = 0.3;
    torso.castShadow = true;
    torso.receiveShadow = true;
    characterGroup.add(torso);
    
    // === HEAD (realistic proportions) ===
    const headGeo = new THREE.SphereGeometry(0.15, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.85;
    head.scale.y = 1.1; // Slightly elongated
    head.castShadow = true;
    characterGroup.add(head);
    
    // Face features
    const eyeMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      emissive: 0x111111
    });
    const pupilMat = new THREE.MeshStandardMaterial({ 
      color: 0x222222,
      roughness: 0.1
    });
    
    // Eyes with pupils
    for(let side of [-1, 1]) {
      // Eye white
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 6),
        eyeMat
      );
      eye.position.set(side * 0.05, 0.88, 0.13);
      eye.scale.z = 0.5;
      characterGroup.add(eye);
      
      // Pupil
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 6, 4),
        pupilMat
      );
      pupil.position.set(side * 0.05, 0.88, 0.145);
      characterGroup.add(pupil);
      
      // Eyebrow
      const eyebrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.01, 0.01),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      eyebrow.position.set(side * 0.05, 0.93, 0.14);
      eyebrow.rotation.z = side * 0.2;
      characterGroup.add(eyebrow);
    }
    
    // Nose
    const noseGeo = new THREE.ConeGeometry(0.02, 0.03, 4);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, 0.85, 0.15);
    nose.rotation.x = Math.PI / 2;
    characterGroup.add(nose);
    
    // Mouth
    const mouthGeo = new THREE.TorusGeometry(0.02, 0.005, 3, 8, Math.PI);
    const mouth = new THREE.Mesh(mouthGeo, 
      new THREE.MeshStandardMaterial({ color: 0x883333 })
    );
    mouth.position.set(0, 0.8, 0.13);
    mouth.rotation.z = Math.PI;
    characterGroup.add(mouth);
    
    // Hair (random styles)
    const hairStyle = Math.floor(Math.random() * 3);
    const hairMat = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color().setHSL(Math.random() * 0.1, 0.3, 0.2 + Math.random() * 0.3),
      roughness: 0.9
    });
    
    if(hairStyle === 0) { // Short hair
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        hairMat
      );
      hair.position.y = 0.9;
      hair.scale.y = 0.6;
      characterGroup.add(hair);
    } else if(hairStyle === 1) { // Spiky hair
      for(let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.03, 0.08, 4),
          hairMat
        );
        spike.position.set(
          (i - 2) * 0.04,
          0.97,
          -0.05
        );
        spike.rotation.z = (i - 2) * 0.2;
        characterGroup.add(spike);
      }
    } else { // Long hair
      const hair = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.18, 0.25, 8),
        hairMat
      );
      hair.position.y = 0.85;
      characterGroup.add(hair);
    }
    
    // === ARMS (with joints) ===
    for(let side of [-1, 1]) {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.3, 0.5, 0);
      
      // Upper arm
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8),
        clothMat
      );
      upperArm.position.y = -0.15;
      armGroup.add(upperArm);
      
      // Elbow joint
      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 4),
        skinMat
      );
      elbow.position.y = -0.3;
      armGroup.add(elbow);
      
      // Lower arm
      const lowerArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 0.25, 8),
        skinMat
      );
      lowerArm.position.y = -0.425;
      armGroup.add(lowerArm);
      
      // Hand
      const hand = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.1, 0.04),
        skinMat
      );
      hand.position.y = -0.6;
      armGroup.add(hand);
      
      // Fingers
      for(let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.04, 4),
          skinMat
        );
        finger.position.set((i - 1.5) * 0.015, -0.67, 0);
        armGroup.add(finger);
      }
      
      armGroup.userData = { side };
      characterGroup.add(armGroup);
    }
    
    // === LEGS (with realistic joints) ===
    for(let side of [-1, 1]) {
      const legGroup = new THREE.Group();
      legGroup.position.set(side * 0.12, 0, 0);
      
      // Upper leg (thigh)
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.4, 8),
        clothMat
      );
      thigh.position.y = -0.2;
      legGroup.add(thigh);
      
      // Knee
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 4),
        skinMat
      );
      knee.position.y = -0.4;
      legGroup.add(knee);
      
      // Lower leg (shin)
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.4, 8),
        skinMat
      );
      shin.position.y = -0.6;
      legGroup.add(shin);
      
      // Ankle
      const ankle = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 4),
        skinMat
      );
      ankle.position.y = -0.8;
      legGroup.add(ankle);
      
      // Foot (shoe)
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ 
          color: 0x333333,
          roughness: 0.8
        })
      );
      shoe.position.set(0, -0.86, 0.05);
      legGroup.add(shoe);
      
      legGroup.userData = { side };
      characterGroup.add(legGroup);
    }
    
    // === PART INDICATOR (on back) ===
    if (player.part) {
      const partIndicator = createRealisticPartMesh(player.part);
      partIndicator.scale.set(0.12, 0.12, 0.12);
      partIndicator.position.set(0, 0.4, -0.15);
      characterGroup.add(partIndicator);
      
      // Backpack to hold the part
      const backpack = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.25, 0.1),
        new THREE.MeshStandardMaterial({ 
          color: 0x444444,
          roughness: 0.7
        })
      );
      backpack.position.set(0, 0.4, -0.12);
      characterGroup.add(backpack);
    }
    
    // === NAME PLATE (floating above) ===
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    
    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.8)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = gradient;
    ctx.roundRect(10, 10, 492, 108, 20);
    ctx.fill();
    
    // Name text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name, 256, 50);
    
    // Role text
    if (player.part === 'chassis') {
      ctx.fillStyle = '#FFD700';
      ctx.font = '32px Arial';
      ctx.fillText('👑 القائد', 256, 85);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    const spriteMat = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 1.4;
    characterGroup.add(sprite);
    
    return characterGroup;
  };

  const createOtherPlayers = (scene: THREE.Scene) => {
    console.log('Creating realistic characters for players:', players);
    
    // Clear existing
    gameRefs.current.otherPlayers.forEach(data => {
      if(data.mixer) data.mixer.stopAllAction();
      scene.remove(data.group);
    });
    gameRefs.current.otherPlayers.clear();

    players.forEach(player => {
      if (player.id !== SocketClient.id && player.isAlive) {
        const character = createRealisticCharacter(player);
        
        // Set initial position
        const pos = player.position || { 
          x: Math.random() * 10 - 5, 
          y: 0.86, 
          z: Math.random() * 10 - 5 
        };
        character.position.set(pos.x, 0.86, pos.z);
        
        scene.add(character);
        gameRefs.current.otherPlayers.set(player.id, {
          group: character,
          mixer: character.userData.mixer,
          walkCycle: 0,
          isWalking: false,
          lastPosition: { ...pos }
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
          if(playerState.current.isGrounded) {
            playerState.current.velocity.y = 5;
            playerState.current.isGrounded = false;
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
    SocketClient.on('player-moved', ({ playerId, position, rotation }) => {
      const playerData = gameRefs.current.otherPlayers.get(playerId);
      if (playerData) {
        // Store last position for animation
        playerData.lastPosition = { ...playerData.group.position };
        
        // Smooth position interpolation
        playerData.targetPosition = new THREE.Vector3(position.x, 0.86, position.z);
        playerData.targetRotation = rotation.y;
        
        // Check if moving for animation
        const distance = Math.sqrt(
          Math.pow(position.x - playerData.lastPosition.x, 2) + 
          Math.pow(position.z - playerData.lastPosition.z, 2)
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
        if(playerData.mixer) playerData.mixer.stopAllAction();
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
    
    // Realistic movement physics
    const keys = playerState.current.keys;
    const baseSpeed = keys.shift ? 8 : 5; // Run or walk
    const acceleration = 15;
    const friction = 10;
    
    // Calculate movement direction
    const moveX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const moveZ = (keys.backward ? 1 : 0) - (keys.forward ? 1 : 0);
    
    // Apply acceleration
    if (moveX !== 0 || moveZ !== 0) {
      const angle = Math.atan2(moveX, moveZ);
      const moveAngle = playerState.current.rotation.y + angle;
      
      playerState.current.acceleration.x = Math.sin(moveAngle) * acceleration;
      playerState.current.acceleration.z = Math.cos(moveAngle) * acceleration;
      playerState.current.isWalking = true;
    } else {
      playerState.current.acceleration.x = 0;
      playerState.current.acceleration.z = 0;
      playerState.current.isWalking = false;
    }
    
    // Update velocity with acceleration
    playerState.current.velocity.x += playerState.current.acceleration.x * delta;
    playerState.current.velocity.z += playerState.current.acceleration.z * delta;
    
    // Apply friction
    playerState.current.velocity.x *= Math.pow(1 - friction * delta, 2);
    playerState.current.velocity.z *= Math.pow(1 - friction * delta, 2);
    
    // Limit max speed
    const currentSpeed = Math.sqrt(
      playerState.current.velocity.x ** 2 + 
      playerState.current.velocity.z ** 2
    );
    if (currentSpeed > baseSpeed) {
      playerState.current.velocity.x = (playerState.current.velocity.x / currentSpeed) * baseSpeed;
      playerState.current.velocity.z = (playerState.current.velocity.z / currentSpeed) * baseSpeed;
    }
    
    // Apply gravity
    if (!playerState.current.isGrounded) {
      playerState.current.velocity.y -= 9.8 * delta;
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
    }
    
    // Boundary limits
    playerState.current.position.x = Math.max(-14, Math.min(14, playerState.current.position.x));
    playerState.current.position.z = Math.max(-14, Math.min(14, playerState.current.position.z));
    
    // Update camera position and rotation
    camera.position.x = playerState.current.position.x;
    camera.position.y = playerState.current.position.y;
    camera.position.z = playerState.current.position.z;
    
    camera.rotation.order = 'YXZ';
    camera.rotation.y = playerState.current.rotation.y;
    camera.rotation.x = playerState.current.rotation.x;
    
    // Realistic walking bobbing
    if (playerState.current.isWalking) {
      playerState.current.walkCycle += currentSpeed * delta * 4;
      const bobX = Math.sin(playerState.current.walkCycle) * 0.03;
      const bobY = Math.abs(Math.sin(playerState.current.walkCycle * 2)) * 0.05;
      
      camera.position.y += bobY;
      camera.rotation.z = bobX * 0.5;
      
      // Hand bobbing
      if (hand) {
        hand.position.x = bobX * 2;
        hand.position.y = -0.3 + bobY;
        hand.rotation.z = bobX;
      }
    } else {
      // Smooth return to neutral
      camera.rotation.z *= 0.95;
      if (hand) {
        hand.position.x *= 0.95;
        hand.position.y = -0.3 + Math.sin(gameRefs.current.clock.getElapsedTime() * 2) * 0.01;
      }
    }
    
    // Animate other players with realistic walking
    gameRefs.current.otherPlayers.forEach((playerData, playerId) => {
      // Smooth position interpolation
      if (playerData.targetPosition) {
        playerData.group.position.lerp(playerData.targetPosition, 0.15);
      }
      
      // Smooth rotation
      if (playerData.targetRotation !== undefined) {
        const currentY = playerData.group.rotation.y;
        const diff = playerData.targetRotation - currentY;
        playerData.group.rotation.y += diff * 0.15;
      }
      
      // Walking animation
      if (playerData.isWalking) {
        playerData.walkCycle += delta * 6;
        const walkPhase = playerData.walkCycle;
        
        // Animate legs
        const legs = playerData.group.children.filter(child => 
          child.userData && child.userData.side !== undefined && 
          child.position.y === 0
        );
        
        legs.forEach((leg, index) => {
          const side = leg.userData.side;
          leg.rotation.x = Math.sin(walkPhase + side * Math.PI) * 0.5;
        });
        
        // Animate arms
        const arms = playerData.group.children.filter(child => 
          child.userData && child.userData.side !== undefined && 
          child.position.y > 0
        );
        
        arms.forEach((arm, index) => {
          const side = arm.userData.side;
          arm.rotation.x = Math.sin(walkPhase - side * Math.PI) * 0.3;
        });
        
        // Body bob
        playerData.group.position.y = 0.86 + Math.abs(Math.sin(walkPhase * 2)) * 0.02;
      } else {
        // Idle animation (breathing)
        const breathe = Math.sin(gameRefs.current.clock.getElapsedTime() * 2) * 0.01;
        playerData.group.position.y = 0.86 + breathe;
      }
      
      // Update animation mixer if exists
      if (playerData.mixer) {
        playerData.mixer.update(delta);
      }
    });
    
    // Check nearby players
    checkNearbyPlayers();
    
    // Send position update
    sendPositionUpdate();
    
    // Render scene
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
    if (playerState.current.isWalking && 
        (!playerState.current.lastUpdate || now - playerState.current.lastUpdate > 50)) {
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
    gameRefs.current.otherPlayers.forEach(data => {
      if(data.mixer) data.mixer.stopAllAction();
    });
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
          {playerState.current.keys.shift && (
            <p className="text-green-400 text-xs animate-pulse">🏃 جري سريع</p>
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