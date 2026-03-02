/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Shield, Zap, AlertTriangle, Trophy, Timer, Heart, RefreshCw, Cpu, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Types ---

enum GameState {
  START,
  PLAYING,
  GAMEOVER,
  WIN
}

enum AgentType {
  SPEED = 'A',
  PROTECTION = 'B'
}

interface AgentConfig {
  maxSpeed: number;
  acceleration: number;
  maneuverability: number;
  damageMultiplier: number;
  shieldDuration: number;
  shieldCooldown: number;
  color: string;
  name: string;
}

const AGENTS: Record<AgentType, AgentConfig> = {
  [AgentType.SPEED]: {
    maxSpeed: 12,
    acceleration: 0.2,
    maneuverability: 6,
    damageMultiplier: 1.0,
    shieldDuration: 3000,
    shieldCooldown: 8000,
    color: '#10b981', // Emerald
    name: 'Agent A - Speed'
  },
  [AgentType.PROTECTION]: {
    maxSpeed: 8,
    acceleration: 0.1,
    maneuverability: 4,
    damageMultiplier: 0.4,
    shieldDuration: 5000,
    shieldCooldown: 10000,
    color: '#3b82f6', // Blue
    name: 'Agent B - Protection'
  }
};

interface Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'traffic' | 'item' | 'mission_item' | 'building' | 'wrong_way' | 'attacker' | 'bullet';
  speed: number;
  color?: string;
  scale?: number;
  collected?: boolean;
  roadOffsetX?: number;
  lastShot?: number;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const TARGET_DISTANCE = 50000;
const INITIAL_TIME = 120;

// --- Helper Functions ---
const getRoadParams = (dist: number) => {
  // Winding path inspired by the user's image
  // Changes direction frequently to create a "snake" effect
  const mainCurve = Math.sin(dist * 0.0006) * 160;
  const secondaryWiggle = Math.cos(dist * 0.0012) * 40;
  const offset = mainCurve + secondaryWiggle;
  
  // Road width varies to create challenging narrow sections
  const width = 380 - Math.abs(Math.sin(dist * 0.00015)) * 160;
  return { offset, width };
};

const TRAFFIC_COLORS = ['#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [activeAgent, setActiveAgent] = useState<AgentType>(AgentType.SPEED);
  const [stability, setStability] = useState(100);
  const [time, setTime] = useState(INITIAL_TIME);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldCooldown, setShieldCooldown] = useState(0);
  const [missionItems, setMissionItems] = useState(0);
  
  // Game refs for mutable state in loop
  const playerPos = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 150 });
  const currentSpeed = useRef(0);
  const entities = useRef<Entity[]>([]);
  const lastTime = useRef(0);
  const keysPressed = useRef<Set<string>>(new Set());
  const entityIdCounter = useRef(0);
  const nextMissionItemDist = useRef(TARGET_DISTANCE * 0.25);
  const wrongWaySpawned = useRef(0);
  const attackersSpawned = useRef(0);

  // --- Input Handling ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setActiveAgent(prev => prev === AgentType.SPEED ? AgentType.PROTECTION : AgentType.SPEED);
      }
      if (e.code === 'Space') {
        activateShield();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shieldCooldown, shieldActive, gameState]);

  const activateShield = useCallback(() => {
    if (shieldCooldown > 0 || shieldActive || gameState !== GameState.PLAYING) return;
    
    const config = AGENTS[activeAgent];
    setShieldActive(true);
    
    setTimeout(() => {
      setShieldActive(false);
      setShieldCooldown(5000); // 5 seconds cooldown after shield ends
    }, config.shieldDuration);
  }, [activeAgent, shieldCooldown, shieldActive, gameState]);

  // --- Game Loop Logic ---

  const spawnEntity = useCallback((currentDist: number) => {
    const progress = currentDist / TARGET_DISTANCE;
    const { offset, width } = getRoadParams(currentDist + CANVAS_HEIGHT); // Look ahead
    const roadCenterX = CANVAS_WIDTH / 2 + offset;
    
    // Spawn Mission Item
    if (currentDist >= nextMissionItemDist.current && nextMissionItemDist.current < TARGET_DISTANCE) {
      const offsetX = (Math.random() - 0.5) * 0.8;
      entities.current.push({
        id: entityIdCounter.current++,
        x: roadCenterX + offsetX * width,
        y: -150,
        width: 30,
        height: 30,
        type: 'mission_item',
        speed: 0,
        roadOffsetX: offsetX
      });
      nextMissionItemDist.current += TARGET_DISTANCE * 0.25;
      return;
    }

    // Spawn Building at the end
    if (currentDist >= TARGET_DISTANCE - CANVAS_HEIGHT && !entities.current.some(e => e.type === 'building')) {
      entities.current.push({
        id: entityIdCounter.current++,
        x: CANVAS_WIDTH / 2,
        y: -300,
        width: 400,
        height: 200,
        type: 'building',
        speed: 0
      });
      return;
    }

    // Spawn wrong way
    if (currentDist > wrongWaySpawned.current * 10000 + 5000 && wrongWaySpawned.current < 5) {
      const offsetX = (Math.random() - 0.5) * 0.8;
      entities.current.push({
        id: entityIdCounter.current++,
        x: roadCenterX + offsetX * width,
        y: -150,
        width: 30,
        height: 50,
        type: 'wrong_way',
        speed: -4, // Negative speed means it moves down the screen faster
        color: '#fb923c', // Orange
        roadOffsetX: offsetX
      });
      wrongWaySpawned.current++;
    }

    // Spawn attacker
    if (currentDist > attackersSpawned.current * 5000 + 2500 && attackersSpawned.current < 10) {
      const offsetX = (Math.random() - 0.5) * 0.8;
      entities.current.push({
        id: entityIdCounter.current++,
        x: roadCenterX + offsetX * width,
        y: -150,
        width: 30,
        height: 50,
        type: 'attacker',
        speed: 4, // Similar to player speed or slightly slower
        color: '#64748b', // Grey
        roadOffsetX: offsetX,
        lastShot: 0
      });
      attackersSpawned.current++;
    }

    if (currentDist >= TARGET_DISTANCE) return;

    // Dynamic spawn rate based on progress
    const spawnChance = 0.02 + progress * 0.06;
    
    if (Math.random() < spawnChance) {
      const isItem = Math.random() > 0.8;
      const offsetX = (Math.random() - 0.5) * 0.8;
      
      // Prevent overlapping spawns
      const isOverlapping = entities.current.some(e => 
        e.y < 0 && e.roadOffsetX !== undefined && Math.abs(e.roadOffsetX - offsetX) < 0.2
      );
      if (isOverlapping) return;

      const x = roadCenterX + offsetX * width;
      
      if (isItem) {
        entities.current.push({
          id: entityIdCounter.current++,
          x,
          y: -150,
          width: 20,
          height: 20,
          type: 'item',
          speed: 0,
          roadOffsetX: offsetX
        });
      } else {
        const scale = 0.8 + Math.random() * 0.6;
        const speedMultiplier = 1 + progress * 1.5;
        entities.current.push({
          id: entityIdCounter.current++,
          x,
          y: -150,
          width: 30 * scale,
          height: 50 * scale,
          type: 'traffic',
          speed: (2 + Math.random() * 4) * speedMultiplier,
          color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
          scale,
          roadOffsetX: offsetX
        });
      }
    }
  }, []);

  const update = useCallback((deltaTime: number) => {
    if (gameState !== GameState.PLAYING) return;

    const config = AGENTS[activeAgent];

    // Update Cooldowns
    if (shieldCooldown > 0) {
      setShieldCooldown(prev => Math.max(0, prev - deltaTime));
    }

    // Player Movement
    if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('KeyW')) {
      currentSpeed.current = Math.min(config.maxSpeed, currentSpeed.current + config.acceleration);
    } else if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('KeyS')) {
      currentSpeed.current = Math.max(0, currentSpeed.current - config.acceleration * 2);
    } else {
      currentSpeed.current = Math.max(0, currentSpeed.current - 0.05);
    }

    // Current road params at player position
    const { offset: playerRoadOffset, width: playerRoadWidth } = getRoadParams(distance);
    const roadCenterX = CANVAS_WIDTH / 2 + playerRoadOffset;
    const leftBound = roadCenterX - playerRoadWidth / 2 + 15;
    const rightBound = roadCenterX + playerRoadWidth / 2 - 15;

    if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('KeyA') || keysPressed.current.has('KeyQ')) {
      playerPos.current.x -= config.maneuverability;
    }
    if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('KeyD') || keysPressed.current.has('KeyE')) {
      playerPos.current.x += config.maneuverability;
    }

    // Keep player on road
    if (playerPos.current.x < leftBound) {
      playerPos.current.x = leftBound;
      currentSpeed.current *= 0.9; // Slow down when hitting grass
    }
    if (playerPos.current.x > rightBound) {
      playerPos.current.x = rightBound;
      currentSpeed.current *= 0.9;
    }

    // Scroll & Distance
    setDistance(prev => {
      const next = prev + currentSpeed.current;
      return next;
    });

    setScore(prev => prev + Math.floor(currentSpeed.current * 0.1));

    // Time
    setTime(prev => {
      const next = prev - deltaTime / 1000;
      if (next <= 0) {
        setGameState(GameState.GAMEOVER);
      }
      return next;
    });

    // Entities
    spawnEntity(distance);

    entities.current = entities.current.filter(entity => {
      if (entity.collected) return false;
      
      entity.y += currentSpeed.current - entity.speed;

      // Update X based on road curve
      const entityDist = distance + (CANVAS_HEIGHT - entity.y);
      if (entity.roadOffsetX !== undefined && entity.type !== 'building') {
        const { offset, width } = getRoadParams(entityDist);
        let centerX = CANVAS_WIDTH / 2 + offset;
        
        if (entity.type === 'traffic' && entityDist > TARGET_DISTANCE - 300) {
           // Move left
           const leftTurnProgress = Math.min(1, (entityDist - (TARGET_DISTANCE - 300)) / 200);
           centerX -= leftTurnProgress * CANVAS_WIDTH;
        }
        
        if (entity.type === 'attacker') {
          const playerOffsetX = (playerPos.current.x - (CANVAS_WIDTH / 2 + getRoadParams(distance).offset)) / getRoadParams(distance).width;
          if (entity.roadOffsetX < playerOffsetX - 0.02) {
            entity.roadOffsetX += 0.005;
          } else if (entity.roadOffsetX > playerOffsetX + 0.02) {
            entity.roadOffsetX -= 0.005;
          }
          
          // Shoot bullet
          const now = Date.now();
          if (now - (entity.lastShot || 0) > 2000 && entity.y < playerPos.current.y - 100 && entity.y > 0) {
             entities.current.push({
               id: entityIdCounter.current++,
               x: entity.x,
               y: entity.y + entity.height / 2,
               width: 6,
               height: 12,
               type: 'bullet',
               speed: -2, // Moves down towards player
               color: '#fbbf24',
               roadOffsetX: entity.roadOffsetX
             });
             entity.lastShot = now;
          }
        }
        
        entity.x = centerX + entity.roadOffsetX * width;
      }

      // Collision Check
      const dx = Math.abs(playerPos.current.x - entity.x);
      const dy = Math.abs(playerPos.current.y - entity.y);
      const collisionDistX = (entity.width + 20) / 2;
      const collisionDistY = (entity.height + 30) / 2;
      
      if (dx < collisionDistX && dy < collisionDistY) {
        if (entity.type === 'item') {
          setStability(s => {
            if (s >= 100) {
              setScore(score => score + 100);
              return 100;
            }
            return Math.min(100, s + 10);
          });
          return false; // Remove item
        } else if (entity.type === 'mission_item') {
          setMissionItems(m => {
            const newM = m + 1;
            if (newM === 3) {
              setScore(s => s + 1500); // 500 + 1000 bonus
            } else {
              setScore(s => s + 500);
            }
            return newM;
          });
          return false;
        } else if (entity.type === 'building') {
          // Reached the end
          if (missionItems >= 2) {
            setGameState(GameState.WIN);
          } else {
            setGameState(GameState.GAMEOVER); // Failed mission requirement
          }
          currentSpeed.current = 0;
        } else if ((entity.type === 'traffic' || entity.type === 'wrong_way' || entity.type === 'attacker' || entity.type === 'bullet') && !shieldActive) {
          const damage = (entity.type === 'bullet' || entity.type === 'wrong_way') ? 20 : (entity.speed > 4 ? 20 : 10);
          setStability(s => {
            const next = s - damage * config.damageMultiplier;
            if (next <= 0) setGameState(GameState.GAMEOVER);
            return Math.max(0, next);
          });
          if (entity.type !== 'bullet') {
            currentSpeed.current *= 0.5;
          }
          entity.collected = true; // Mark as hit so we don't hit it multiple times
        }
      }

      return entity.y < CANVAS_HEIGHT + 100;
    });
  }, [gameState, activeAgent, shieldActive, shieldCooldown, spawnEntity, distance, missionItems]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Grass Background
    ctx.fillStyle = '#064e3b'; // Dark green
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw Road (we draw it segment by segment to show curves)
    const segments = 40;
    const segmentHeight = CANVAS_HEIGHT / segments;
    
    for (let i = segments; i >= 0; i--) {
      const y = i * segmentHeight;
      // The distance at this y-coordinate
      const distAtY = distance + (CANVAS_HEIGHT - y);
      
      if (distAtY > TARGET_DISTANCE + 200) continue; // Road ends

      const { offset, width } = getRoadParams(distAtY);
      const centerX = CANVAS_WIDTH / 2 + offset;
      
      // Road surface
      ctx.fillStyle = '#374151';
      ctx.fillRect(centerX - width / 2, y, width, segmentHeight + 1);
      
      // Checkered Borders (Red and White like a race track)
      const isRed = Math.floor(distAtY / 60) % 2 === 0;
      ctx.fillStyle = isRed ? '#ef4444' : '#ffffff';
      ctx.fillRect(centerX - width / 2 - 12, y, 12, segmentHeight + 1);
      ctx.fillRect(centerX + width / 2, y, 12, segmentHeight + 1);
      
      // Outer dark border for the checkered edge
      ctx.fillStyle = '#111827';
      ctx.fillRect(centerX - width / 2 - 14, y, 2, segmentHeight + 1);
      ctx.fillRect(centerX + width / 2 + 12, y, 2, segmentHeight + 1);
      
      // Center dashed line
      if (Math.floor(distAtY / 40) % 2 === 0) {
        ctx.fillStyle = '#ffffff66';
        ctx.fillRect(centerX - 2, y, 4, segmentHeight + 1);
      }

      // Draw left path for traffic
      if (distAtY > TARGET_DISTANCE - 300 && distAtY < TARGET_DISTANCE - 100) {
         ctx.fillStyle = '#1f2937';
         ctx.fillRect(0, y, centerX - width / 2 + 10, segmentHeight + 1);
         // Top and bottom borders for the side road
         if (distAtY > TARGET_DISTANCE - 110 && distAtY < TARGET_DISTANCE - 90) {
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(0, y, centerX - width / 2, 5);
         }
         if (distAtY > TARGET_DISTANCE - 310 && distAtY < TARGET_DISTANCE - 290) {
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(0, y, centerX - width / 2, 5);
         }
      }
    }

    // Draw Entities
    // Sort by Y to draw back-to-front
    const sortedEntities = [...entities.current].sort((a, b) => a.y - b.y);
    
    sortedEntities.forEach(entity => {
      if (entity.collected) return;

      ctx.save();
      
      // Fade in effect
      if (entity.y < 50 && entity.type !== 'building') {
        ctx.globalAlpha = Math.max(0, (entity.y + 150) / 200);
      }
      
      ctx.translate(entity.x, entity.y);

      if (entity.type === 'traffic' || entity.type === 'wrong_way' || entity.type === 'attacker') {
        ctx.fillStyle = entity.color || '#ef4444';
        // Car body
        ctx.fillRect(-entity.width / 2, -entity.height / 2, entity.width, entity.height);
        // Roof
        ctx.fillStyle = '#00000044';
        ctx.fillRect(-entity.width / 2 + 4, -entity.height / 2 + 10, entity.width - 8, entity.height - 20);
        // Windshield
        ctx.fillStyle = '#bae6fd';
        if (entity.type === 'wrong_way') {
          // Windshield on bottom
          ctx.fillRect(-entity.width / 2 + 4, entity.height / 2 - 13, entity.width - 8, 8);
          // Headlights on bottom
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-entity.width / 2 + 2, entity.height / 2 - 4, 6, 4);
          ctx.fillRect(entity.width / 2 - 8, entity.height / 2 - 4, 6, 4);
        } else {
          // Windshield on top
          ctx.fillRect(-entity.width / 2 + 4, -entity.height / 2 + 5, entity.width - 8, 8);
          // Taillights on bottom
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(-entity.width / 2 + 2, entity.height / 2 - 4, 6, 4);
          ctx.fillRect(entity.width / 2 - 8, entity.height / 2 - 4, 6, 4);
        }
      } else if (entity.type === 'bullet') {
        ctx.fillStyle = entity.color || '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, 0, entity.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = entity.color || '#fbbf24';
      } else if (entity.type === 'item') {
        // Yellow collectible
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, 0, entity.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', 0, 0);
      } else if (entity.type === 'mission_item') {
        // Red mandatory item
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -entity.height / 2);
        ctx.lineTo(entity.width / 2, 0);
        ctx.lineTo(0, entity.height / 2);
        ctx.lineTo(-entity.width / 2, 0);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0);
      } else if (entity.type === 'building') {
        // Safe Zone Building
        ctx.fillStyle = '#334155';
        ctx.fillRect(-entity.width / 2, -entity.height / 2, entity.width, entity.height);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-entity.width / 2 + 20, -entity.height / 2 + 20, entity.width - 40, entity.height - 40);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SAFE ZONE', 0, 0);
      }
      
      ctx.restore();
    });

    // Draw Player
    const config = AGENTS[activeAgent];
    ctx.save();
    ctx.translate(playerPos.current.x, playerPos.current.y);
    
    // Shield Aura
    if (shieldActive) {
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `${config.color}44`;
      ctx.fill();
    }

    // Car Body
    ctx.fillStyle = config.color;
    ctx.fillRect(-15, -20, 30, 40);
    // Aerodynamic front
    ctx.beginPath();
    ctx.moveTo(-15, -20);
    ctx.lineTo(0, -35);
    ctx.lineTo(15, -20);
    ctx.fill();
    
    // Details
    ctx.fillStyle = '#00000066';
    ctx.fillRect(-10, -10, 20, 20); // Roof
    ctx.fillStyle = '#fff';
    ctx.fillRect(-10, -15, 20, 8); // Windshield
    
    // Headlights
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-12, -30, 6, 6);
    ctx.fillRect(6, -30, 6, 6);
    
    ctx.restore();
  }, [activeAgent, distance, shieldActive]);

  useEffect(() => {
    let animationFrameId: number;
    
    const loop = (time: number) => {
      const deltaTime = time - lastTime.current;
      lastTime.current = time;

      if (gameState === GameState.PLAYING) {
        update(deltaTime);
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) draw(ctx);

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, update, draw]);

  // --- UI Helpers ---

  const startGame = () => {
    setGameState(GameState.PLAYING);
    setStability(100);
    setTime(INITIAL_TIME);
    setScore(0);
    setDistance(0);
    setMissionItems(0);
    entities.current = [];
    playerPos.current = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 150 };
    currentSpeed.current = 0;
    setShieldActive(false);
    setShieldCooldown(0);
    entityIdCounter.current = 0;
    nextMissionItemDist.current = TARGET_DISTANCE * 0.25;
    wrongWaySpawned.current = 0;
    attackersSpawned.current = 0;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl h-[95vh] bg-neutral-900 rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Top HUD */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 pointer-events-none">
          {/* Time (Top Left) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 flex items-center gap-2">
            <Timer size={16} className="text-neutral-400" />
            <div className={`text-xl font-mono font-bold ${time < 15 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {Math.max(0, Math.ceil(time))}s
            </div>
          </div>

          {/* Stability Bar (Top Center) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 w-64 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Heart size={14} className="text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">Stability</span>
              </div>
              <span className="text-xs font-mono font-bold">{Math.round(stability)}%</span>
            </div>
            <div className="h-2.5 bg-black rounded-full overflow-hidden p-0.5 border border-white/10">
              <motion.div 
                className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full"
                animate={{ width: `${stability}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            </div>
          </div>

          {/* Score (Top Right) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 flex items-center gap-2">
            <div className="text-xl font-mono font-bold text-emerald-400">
              {score}
            </div>
            <Trophy size={16} className="text-neutral-400" />
          </div>
        </div>

        {/* Bottom HUD */}
        <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end z-20 pointer-events-none">
          {/* Agent Selector (Bottom Left) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex gap-2">
            {[AgentType.SPEED, AgentType.PROTECTION].map(type => {
              const config = AGENTS[type];
              const isActive = activeAgent === type;
              return (
                <div 
                  key={type}
                  className={`p-2 rounded-xl border transition-all flex flex-col items-center justify-center w-16 h-16 ${
                    isActive 
                      ? 'bg-white/20 border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                      : 'bg-black/40 border-white/5 opacity-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded flex items-center justify-center mb-1" style={{ backgroundColor: config.color }}>
                    {type === AgentType.SPEED ? <Zap size={16} className="text-black" /> : <Shield size={16} className="text-white" />}
                  </div>
                  <span className="font-bold text-[8px] uppercase">{type === AgentType.SPEED ? 'SPD' : 'PRO'}</span>
                </div>
              );
            })}
          </div>

          {/* Mission Items & Distance (Bottom Center) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 flex flex-col items-center gap-2 w-48">
             <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                    missionItems >= i 
                      ? 'bg-red-500/20 border-red-500 text-red-500' 
                      : 'bg-black/50 border-white/10 text-neutral-700'
                  }`}
                >
                  <AlertTriangle size={14} />
                </div>
              ))}
            </div>
            <div className="w-full h-1.5 bg-black rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-white"
                animate={{ width: `${Math.min(100, (distance / TARGET_DISTANCE) * 100)}%` }}
              />
            </div>
          </div>

          {/* Shield Status (Bottom Right) */}
          <div className="bg-black/50 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center gap-3">
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Shield</div>
              <div className={`text-[12px] font-mono font-bold ${shieldActive ? 'text-emerald-400' : shieldCooldown > 0 ? 'text-red-400' : 'text-white'}`}>
                {shieldActive ? 'ACTIVE' : shieldCooldown > 0 ? `${(shieldCooldown / 1000).toFixed(1)}s` : 'READY'}
              </div>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-xl ${shieldActive ? 'bg-emerald-500/20 border-emerald-500' : shieldCooldown === 0 ? 'bg-white/10 border-white/20' : 'bg-black/50 border-white/5'} border flex items-center justify-center transition-colors`}>
                <Shield size={20} className={shieldActive ? 'text-emerald-400' : shieldCooldown === 0 ? 'text-white' : 'text-neutral-600'} />
              </div>
              {shieldCooldown > 0 && !shieldActive && (
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <rect x="2" y="2" width="44" height="44" rx="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/5" />
                  <rect
                    x="2" y="2" width="44" height="44" rx="10" stroke="currentColor" strokeWidth="2" fill="transparent"
                    strokeDasharray={160}
                    strokeDashoffset={160 * (shieldCooldown / 5000)}
                    className="text-red-500 transition-all duration-100"
                  />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Game Canvas Area */}
        <div className="relative flex-1 w-full bg-black overflow-hidden flex justify-center items-center">
          <canvas 
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full object-cover"
          />

          {/* Overlays */}
          <AnimatePresence>
            {gameState === GameState.START && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-8 z-30"
              >
                <div className="mb-6 p-4 rounded-full bg-emerald-500/20 text-emerald-400">
                  <Zap size={48} />
                </div>
                <h1 className="text-5xl font-bold mb-2 tracking-tighter italic">AGENT ROAD</h1>
                <p className="text-neutral-400 mb-8 text-sm max-w-md">
                  Reach the safe zone in 2:00. Collect at least 2 red mission items. 
                  Switch agents strategically. Survive the traffic.
                  <br /><br />
                  <span className="text-xs font-mono">
                    [W/S] SPEED | [Q/E] STEER | [SPACE] SHIELD | [SHIFT] AGENT
                  </span>
                </p>
                <button 
                  onClick={startGame}
                  className="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-emerald-400 transition-colors text-lg cursor-pointer pointer-events-auto"
                >
                  START MISSION
                </button>
              </motion.div>
            )}

            {(gameState === GameState.GAMEOVER || gameState === GameState.WIN) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center p-8 z-30"
              >
                {gameState === GameState.WIN ? (
                  <>
                    <Trophy size={64} className="text-yellow-400 mb-4" />
                    <h2 className="text-4xl font-bold mb-2 text-emerald-400">MISSION COMPLETE</h2>
                    <p className="text-neutral-400 mb-6">You reached the safe zone with all assets.</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={64} className="text-red-500 mb-4" />
                    <h2 className="text-4xl font-bold mb-2 text-red-500">MISSION FAILED</h2>
                    <p className="text-neutral-400 mb-6">
                      {time <= 0 ? "Time expired." : 
                       stability <= 0 ? "Vehicle destroyed." : 
                       "Arrived without all mission items."}
                    </p>
                  </>
                )}
                <div className="text-3xl font-mono mb-2">SCORE: {score}</div>
                <div className="text-neutral-400 mb-8 flex gap-4">
                  <span>Items: {missionItems}/3 {missionItems === 3 ? '(+1000 pts)' : ''}</span>
                  <span>Dist: {Math.round((distance / TARGET_DISTANCE) * 100)}%</span>
                </div>
                <button 
                  onClick={startGame}
                  className="flex items-center gap-2 px-8 py-4 bg-neutral-800 border border-white/10 rounded-full hover:bg-white hover:text-black transition-all text-lg font-bold cursor-pointer pointer-events-auto"
                >
                  <RefreshCw size={20} /> RETRY MISSION
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
