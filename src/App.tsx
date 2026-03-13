/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  Trophy, 
  Timer, 
  Heart, 
  RefreshCw, 
  Cpu, 
  Target,
  Maximize,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Types ---

enum GameState {
  SPLASH,
  DIALOGUE,
  MENU,
  BRIEFING,
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
    maxSpeed: 16,
    acceleration: 0.3,
    maneuverability: 7,
    damageMultiplier: 1.0,
    shieldDuration: 3000,
    shieldCooldown: 8000,
    color: '#10b981', // Emerald
    name: 'Speed'
  },
  [AgentType.PROTECTION]: {
    maxSpeed: 11,
    acceleration: 0.15,
    maneuverability: 5,
    damageMultiplier: 0.4,
    shieldDuration: 6000,
    shieldCooldown: 10000,
    color: '#3b82f6', // Blue
    name: 'Warden'
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

const CANVAS_WIDTH = 450;
const CANVAS_HEIGHT = 1000;
const TARGET_DISTANCE = 50000;
const INITIAL_TIME = 150;

// --- Helper Functions ---
const getRoadParams = (dist: number) => {
  // Winding path inspired by the user's image
  // Changes direction frequently to create a "snake" effect
  const mainCurve = Math.sin(dist * 0.0006) * 100;
  const secondaryWiggle = Math.cos(dist * 0.0012) * 25;
  const offset = mainCurve + secondaryWiggle;
  
  // Road width varies to create challenging narrow sections
  const width = 280 - Math.abs(Math.sin(dist * 0.00015)) * 100;
  return { offset, width };
};

const TRAFFIC_COLORS = ['#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

// --- Main Component ---

// --- Helper Components ---
const TypewriterText = ({ text, delay = 30, onComplete }: { text: string; delay?: number; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  
  useEffect(() => {
    setDisplayedText("");
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay, onComplete]);

  return <span>{displayedText}</span>;
};

const DossierWrapper = ({ children, title, onBack }: { children: React.ReactNode; title: string; onBack: () => void }) => (
  <div className="flex flex-col items-center w-full max-w-md animate-in fade-in zoom-in duration-300">
    <div className="relative w-full">
      {/* Red Folder Background */}
      <div className="absolute inset-0 bg-red-950 rounded-lg shadow-2xl transform -rotate-1 translate-x-2 translate-y-2"></div>
      <div className="relative bg-red-900 rounded-lg shadow-xl p-3 pb-6 transform rotate-1">
        {/* Folder Tab */}
        <div className="absolute -top-4 left-6 bg-red-900 px-4 py-1 rounded-t-lg font-black text-[8px] text-red-400 tracking-widest uppercase">
          FILE_ID: 437518
        </div>
        
        {/* White Paper */}
        <div className="bg-[#f5f5f5] text-neutral-900 p-6 rounded shadow-inner min-h-[450px] flex flex-col relative overflow-hidden border border-neutral-300">
          {/* Paperclip effect */}
          <div className="absolute top-4 right-10 w-4 h-10 border-2 border-neutral-400 rounded-full opacity-40 transform rotate-12"></div>
          
          {/* Paper Header */}
          <div className="border-b border-black/10 pb-3 mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase italic text-red-900">{title}</h2>
              <div className="text-[8px] font-mono opacity-60 uppercase">Agent Road Investigation Board</div>
            </div>
            <div className="w-10 h-10 border-2 border-red-600/30 rounded-full flex items-center justify-center text-red-600/40 font-black text-[6px] rotate-12 uppercase text-center leading-tight">
              Top<br/>Secret
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 text-left">
            {children}
          </div>

          {/* Footer details */}
          <div className="mt-6 pt-3 border-t border-black/5 flex justify-between items-center">
            <div className="text-[8px] font-mono opacity-40">CONFIDENTIAL // 2026</div>
            <button 
              onClick={onBack}
              className="px-6 py-2 bg-neutral-900 text-white font-bold rounded text-xs hover:bg-red-900 transition-colors uppercase tracking-widest"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.SPLASH);
  const [activeAgent, setActiveAgent] = useState<AgentType>(AgentType.SPEED);
  const [stability, setStability] = useState(100);
  const [time, setTime] = useState(INITIAL_TIME);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldCooldown, setShieldCooldown] = useState(0);
  const [missionItems, setMissionItems] = useState(0);
  const [dialogueStep, setDialogueStep] = useState(0);
  const [showSecondDialogue, setShowSecondDialogue] = useState(false);
  const [highScores, setHighScores] = useState<number[]>(() => {
    const saved = localStorage.getItem('agent_road_scores');
    return saved ? JSON.parse(saved) : [];
  });
  const [menuView, setMenuView] = useState<'main' | 'controls' | 'scores'>('main');
  
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
  const containerRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  useEffect(() => {
    if (gameState === GameState.GAMEOVER || gameState === GameState.WIN) {
      setHighScores(prev => {
        const newScores = [...prev, score].sort((a, b) => b - a).slice(0, 5);
        localStorage.setItem('agent_road_scores', JSON.stringify(newScores));
        return newScores;
      });
    }
  }, [gameState, score]);

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleTouchStartGlobal = (e: React.TouchEvent) => {
    if (gameState !== GameState.PLAYING) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchCurrentX.current = touch.clientX;
    keysPressed.current.add('KeyW');
  };

  const handleTouchMoveGlobal = (e: React.TouchEvent) => {
    if (gameState !== GameState.PLAYING) return;
    const touch = e.touches[0];
    touchCurrentX.current = touch.clientX;
  };

  const handleTouchEndGlobal = () => {
    touchStartX.current = null;
    touchCurrentX.current = null;
    keysPressed.current.delete('KeyW');
  };

  const handleTouchStart = (key: string) => {
    keysPressed.current.add(key);
  };

  const handleTouchEnd = (key: string) => {
    keysPressed.current.delete(key);
  };

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

    // Touch Steering
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const diff = touchCurrentX.current - touchStartX.current;
      const containerWidth = containerRef.current?.clientWidth || 1;
      const normalizedDiff = (diff / containerWidth) * CANVAS_WIDTH;
      playerPos.current.x += normalizedDiff * 1.5;
      touchStartX.current = touchCurrentX.current;
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
    const segments = 50;
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
    setGameState(GameState.BRIEFING);
    setStability(100);
    setTime(INITIAL_TIME);
    setScore(0);
    setDistance(0);
    setMissionItems(0);
    entities.current = [];
    playerPos.current = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT * 0.65 };
    currentSpeed.current = 0;
    setShieldActive(false);
    setShieldCooldown(0);
    entityIdCounter.current = 0;
    nextMissionItemDist.current = TARGET_DISTANCE * 0.25;
    wrongWaySpawned.current = 0;
    attackersSpawned.current = 0;
  };

  const startMission = () => {
    setGameState(GameState.PLAYING);
    lastTime.current = performance.now();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex items-center justify-center">
      <div ref={containerRef} className="relative w-full max-w-lg h-screen bg-neutral-900 sm:rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Top HUD */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 pointer-events-none">
          <div className="flex gap-2">
            {/* Full Screen Button */}
            <button 
              onClick={toggleFullScreen}
              className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors pointer-events-auto"
            >
              <Maximize size={16} />
            </button>

            {/* Time (Top Left) */}
            <div className="bg-black/50 backdrop-blur-md p-3 rounded-xl border border-white/10 flex items-center gap-2">
              <Timer size={16} className="text-neutral-400" />
              <div className={`text-xl font-mono font-bold ${time < 15 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {Math.max(0, Math.ceil(time))}s
              </div>
            </div>
          </div>

          {/* Stability Bar (Top Center) */}
          <div className="bg-black/50 backdrop-blur-md p-2 rounded-xl border border-white/10 w-32 sm:w-48 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <Heart size={12} className="text-red-500" />
                <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-300">Stability</span>
              </div>
              <span className="text-[10px] font-mono font-bold">{Math.round(stability)}%</span>
            </div>
            <div className="h-1.5 bg-black rounded-full overflow-hidden p-0.5 border border-white/10">
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
          <div className="bg-black/50 backdrop-blur-md p-2 rounded-xl border border-white/10 flex flex-col items-center gap-1 w-32 sm:w-40">
             <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                    missionItems >= i 
                      ? 'bg-red-500/20 border-red-500 text-red-500' 
                      : 'bg-black/50 border-white/10 text-neutral-700'
                  }`}
                >
                  <AlertTriangle size={12} />
                </div>
              ))}
            </div>
            <div className="w-full h-1 bg-black rounded-full overflow-hidden">
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
        <div 
          className="relative flex-1 w-full bg-black overflow-hidden flex justify-center items-center touch-none"
          onTouchStart={handleTouchStartGlobal}
          onTouchMove={handleTouchMoveGlobal}
          onTouchEnd={handleTouchEndGlobal}
        >
          <canvas 
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full object-cover"
          />

          {/* Touch Controls (Only visible in PLAYING state) */}
          {gameState === GameState.PLAYING && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              {/* Mobile Specific Buttons (Hidden on desktop) */}
              <div className="md:hidden absolute inset-0 flex justify-between items-end p-6 pb-32">
                {/* Shield Button (Left) */}
                <button 
                  onMouseDown={(e) => { e.stopPropagation(); activateShield(); }}
                  onTouchStart={(e) => { e.stopPropagation(); activateShield(); }}
                  className="w-16 h-16 bg-white text-black border border-white/20 rounded-full flex flex-col items-center justify-center active:bg-neutral-600 active:text-white transition-colors shadow-lg pointer-events-auto"
                >
                  <Shield size={24} />
                  <span className="text-[8px] font-bold mt-1">SHIELD</span>
                </button>

                {/* Agent Button (Right) */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setActiveAgent(prev => prev === AgentType.SPEED ? AgentType.PROTECTION : AgentType.SPEED); }}
                  className="w-16 h-16 bg-white text-black border border-white/20 rounded-full flex flex-col items-center justify-center active:bg-neutral-600 active:text-white transition-colors shadow-lg pointer-events-auto"
                >
                  <RefreshCw size={24} />
                  <span className="text-[8px] font-bold mt-1">AGENT</span>
                </button>
              </div>

              {/* Desktop/General HUD elements could go here if needed */}
            </div>
          )}

          {/* Overlays */}
          <AnimatePresence>
            {gameState === GameState.SPLASH && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setGameState(GameState.DIALOGUE)}
                className="absolute inset-0 bg-gradient-to-b from-red-900 via-red-950 to-black flex flex-col items-center justify-center text-center p-8 z-30 cursor-pointer"
              >
                {/* City Silhouette Background */}
                <div className="absolute bottom-0 left-0 right-0 h-1/2 pointer-events-none overflow-hidden">
                  <svg viewBox="0 0 800 400" className="w-full h-full opacity-40" preserveAspectRatio="none">
                    <path d="M0,400 L0,300 L20,300 L20,250 L50,250 L50,280 L80,280 L80,220 L120,220 L120,260 L150,260 L150,180 L200,180 L200,240 L230,240 L230,200 L280,200 L280,260 L320,260 L320,150 L380,150 L380,230 L420,230 L420,190 L480,190 L480,250 L520,250 L520,170 L580,170 L580,240 L620,240 L620,210 L680,210 L680,260 L720,260 L720,190 L780,190 L780,300 L800,300 L800,400 Z" fill="black" />
                    {/* Windows */}
                    {[...Array(50)].map((_, i) => (
                      <rect key={i} x={Math.random() * 800} y={200 + Math.random() * 200} width="4" height="6" fill="#fef08a" opacity={Math.random() * 0.8} />
                    ))}
                  </svg>
                </div>
                
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="relative z-10"
                >
                  <h1 className="text-6xl font-black mb-4 tracking-tighter italic text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">AGENT ROAD</h1>
                  <motion.p 
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-neutral-400 text-sm uppercase tracking-[0.3em]"
                  >
                    Click or Tap to Continue
                  </motion.p>
                </motion.div>
              </motion.div>
            )}

            {gameState === GameState.DIALOGUE && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  if (dialogueStep < 2) {
                    setDialogueStep(prev => prev + 1);
                    setShowSecondDialogue(false);
                  } else {
                    setGameState(GameState.MENU);
                  }
                }}
                className="absolute inset-0 bg-gradient-to-b from-red-900 via-red-950 to-black flex flex-col items-center justify-center p-8 z-30 cursor-pointer overflow-hidden"
              >
                {/* City Silhouette Background (Same as Splash) */}
                <div className="absolute bottom-0 left-0 right-0 h-1/2 pointer-events-none opacity-20 overflow-hidden">
                  <svg viewBox="0 0 800 400" className="w-full h-full" preserveAspectRatio="none">
                    <path d="M0,400 L0,300 L20,300 L20,250 L50,250 L50,280 L80,280 L80,220 L120,220 L120,260 L150,260 L150,180 L200,180 L200,240 L230,240 L230,200 L280,200 L280,260 L320,260 L320,150 L380,150 L380,230 L420,230 L420,190 L480,190 L480,250 L520,250 L520,170 L580,170 L580,240 L620,240 L620,210 L680,210 L680,260 L720,260 L720,190 L780,190 L780,300 L800,300 L800,400 Z" fill="black" />
                  </svg>
                </div>

                <div className="relative z-10 w-full max-w-md flex flex-col gap-4">
                  {dialogueStep === 0 && (
                    <>
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="bg-black/80 border-l-4 border-red-600 p-4 rounded-r-xl text-left shadow-xl"
                      >
                        <div className="text-red-500 font-bold text-xs mb-1 uppercase tracking-widest">Agente Speed</div>
                        <div className="text-white text-sm font-mono leading-relaxed">
                          <TypewriterText 
                            text="La central acaba de confirmar la ruta. Tenemos que cruzar la ciudad antes del amanecer." 
                            onComplete={() => setShowSecondDialogue(true)}
                          />
                        </div>
                      </motion.div>
                      <AnimatePresence>
                        {showSecondDialogue && (
                          <motion.div 
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="bg-black/80 border-r-4 border-neutral-600 p-4 rounded-l-xl text-right shadow-xl self-end"
                          >
                            <div className="text-neutral-400 font-bold text-xs mb-1 uppercase tracking-widest">Agente B</div>
                            <div className="text-white text-sm font-mono leading-relaxed italic">
                              <TypewriterText text="No será facil, el enemigo nos está buscando" delay={40} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {dialogueStep === 1 && (
                    <>
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="bg-black/80 border-l-4 border-blue-400 p-4 rounded-r-xl text-left shadow-xl"
                      >
                        <div className="text-blue-400 font-bold text-xs mb-1 uppercase tracking-widest">Niña</div>
                        <div className="text-white text-sm font-mono leading-relaxed">
                          <TypewriterText 
                            text="¿De verdad vamos a llegar al lugar seguro?" 
                            onComplete={() => setShowSecondDialogue(true)}
                          />
                        </div>
                      </motion.div>
                      <AnimatePresence>
                        {showSecondDialogue && (
                          <motion.div 
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="bg-black/80 border-r-4 border-red-600 p-4 rounded-l-xl text-right shadow-xl self-end"
                          >
                            <div className="text-red-500 font-bold text-xs mb-1 uppercase tracking-widest">Agentes</div>
                            <div className="text-white text-sm font-mono leading-relaxed">
                              <TypewriterText text="Dejanoslo a nosotros" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {dialogueStep === 2 && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-blue-600/90 border-2 border-blue-400 p-6 rounded-2xl text-center shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                    >
                      <div className="text-white font-black text-xl mb-2 tracking-widest">
                        <TypewriterText text="MISIÓN" delay={100} />
                      </div>
                      <div className="text-blue-50 font-bold text-sm leading-relaxed">
                        <TypewriterText text="Llega al punto seguro con la niña antes de que se acabe el tiempo y la estabilidad llegue a 0." />
                      </div>
                    </motion.div>
                  )}

                  <motion.div 
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="mt-8 text-neutral-500 text-[10px] uppercase tracking-[0.2em] self-center"
                  >
                    Click to continue
                  </motion.div>
                </div>
              </motion.div>
            )}

            {gameState === GameState.MENU && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-center p-8 z-30 overflow-hidden"
              >
                {/* Investigation Board Background */}
                <div className="absolute inset-0 pointer-events-none opacity-40 select-none">
                  {/* Corkboard texture simulation */}
                  <div className="absolute inset-0 bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:20px_20px] opacity-20" />
                  
                  {/* Red Strings */}
                  <svg className="absolute inset-0 w-full h-full">
                    <line x1="20%" y1="20%" x2="50%" y2="45%" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="80%" y1="15%" x2="50%" y2="45%" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="15%" y1="75%" x2="50%" y2="45%" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="85%" y1="80%" x2="50%" y2="45%" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="20%" y1="20%" x2="15%" y2="75%" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="80%" y1="15%" x2="85%" y2="80%" stroke="#ef4444" strokeWidth="1.5" />
                  </svg>

                  {/* Scattered Notes & Photos */}
                  <div className="absolute top-[15%] left-[15%] w-24 h-28 bg-white/90 shadow-lg -rotate-6 p-1 border-b-4 border-black/20">
                    <div className="w-full h-20 bg-neutral-800 flex items-center justify-center">
                      <Cpu size={32} className="text-white/20" />
                    </div>
                  </div>
                  
                  <div className="absolute top-[10%] right-[15%] w-20 h-24 bg-yellow-100/90 shadow-lg rotate-12 p-2 text-[6px] text-black text-left font-mono overflow-hidden">
                    CONFIDENTIAL<br/>PROJECT: ROAD<br/>STATUS: ACTIVE<br/>TARGET: 50KM
                  </div>

                  <div className="absolute bottom-[20%] left-[10%] w-28 h-20 bg-white/90 shadow-lg rotate-3 p-2 text-[8px] text-black text-left font-bold">
                    <div className="mb-1 border-b border-black/10">SUSPECTS</div>
                    <div className="flex gap-1">
                       <div className="w-4 h-4 bg-neutral-400" />
                       <div className="w-4 h-4 bg-neutral-400" />
                       <div className="w-4 h-4 bg-neutral-400" />
                    </div>
                  </div>

                  <div className="absolute bottom-[15%] right-[10%] w-24 h-32 bg-white/90 shadow-lg -rotate-12 p-1">
                     <div className="w-full h-24 bg-neutral-900 flex items-center justify-center">
                        <Target size={40} className="text-red-500/40" />
                     </div>
                  </div>

                  {/* Central Label */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                     <div className="flex gap-2">
                        {['A', 'G', 'E', 'N', 'T'].map((char, i) => (
                          <div key={i} className="w-10 h-10 bg-red-600 text-white font-black flex items-center justify-center shadow-xl rotate-[-2deg] border-2 border-red-700">
                            {char}
                          </div>
                        ))}
                     </div>
                  </div>
                </div>

                <div className="relative z-10 w-full flex flex-col items-center">
                  {menuView === 'main' && (
                  <div className="flex flex-col gap-4 w-full max-w-xs">
                    <h2 className="text-3xl font-bold mb-8 italic tracking-tight">MAIN MENU</h2>
                    <button 
                      onClick={() => startGame()}
                      className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-600 hover:text-neutral-100 transition-colors text-lg"
                    >
                      JUGAR
                    </button>
                    <button 
                      onClick={() => setMenuView('controls')}
                      className="w-full py-4 bg-white text-black font-bold rounded-xl border border-white/10 hover:bg-neutral-600 hover:text-neutral-100 transition-colors text-lg"
                    >
                      CONTROLES
                    </button>
                    <button 
                      onClick={() => setMenuView('scores')}
                      className="w-full py-4 bg-white text-black font-bold rounded-xl border border-white/10 hover:bg-neutral-600 hover:text-neutral-100 transition-colors text-lg"
                    >
                      PUNTAJES
                    </button>
                  </div>
                )}

                {menuView === 'controls' && (
                  <DossierWrapper title="CONTROLES" onBack={() => setMenuView('main')}>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-red-800 font-bold mb-2 text-[10px] uppercase tracking-widest border-b border-red-800/20 pb-1">PC (Teclado)</h3>
                        <ul className="text-xs space-y-2 text-neutral-700 font-medium">
                          <li className="flex justify-between"><span>Acelerar / Frenar</span> <span className="font-mono bg-neutral-200 px-1 rounded">[W / S]</span></li>
                          <li className="flex justify-between"><span>Izquierda / Derecha</span> <span className="font-mono bg-neutral-200 px-1 rounded">[A / D]</span></li>
                          <li className="flex justify-between"><span>Activar Escudo</span> <span className="font-mono bg-neutral-200 px-1 rounded">[SPACE]</span></li>
                          <li className="flex justify-between"><span>Cambiar Agente</span> <span className="font-mono bg-neutral-200 px-1 rounded">[SHIFT]</span></li>
                        </ul>
                      </div>
                      
                      <div>
                        <h3 className="text-red-800 font-bold mb-2 text-[10px] uppercase tracking-widest border-b border-red-800/20 pb-1">Celular (Táctil)</h3>
                        <ul className="text-xs space-y-2 text-neutral-700 font-medium">
                          <li className="flex justify-between"><span>Movimiento</span> <span className="font-mono bg-neutral-200 px-1 rounded">Presiona la pantalla</span></li>
                          <li className="flex justify-between"><span>Izquierda / Derecha</span> <span className="font-mono bg-neutral-200 px-1 rounded">Desliza el dedo</span></li>
                          <li className="flex justify-between"><span>Cambiar Agente</span> <span className="font-mono bg-neutral-200 px-1 rounded">[AGENT]</span></li>
                          <li className="flex justify-between"><span>Activar Escudo</span> <span className="font-mono bg-neutral-200 px-1 rounded">[SHIELD]</span></li>
                        </ul>
                      </div>

                      <div className="mt-4 p-3 bg-yellow-100/50 border border-yellow-200 rounded text-[9px] text-yellow-900 italic space-y-1">
                        <p>Nota: Mantén la estabilidad del vehículo por encima de 0 para evitar el fallo de la misión.</p>
                        <p>Agentes: El agente Speed es más veloz. El agente Warden es más lento pero resiste mejor los impactos y su escudo dura más tiempo.</p>
                      </div>
                    </div>
                  </DossierWrapper>
                )}

                {menuView === 'scores' && (
                  <DossierWrapper title="MEJORES PUNTAJES" onBack={() => setMenuView('main')}>
                    <div className="w-full bg-white/50 rounded border border-black/5 overflow-hidden">
                      {highScores.length > 0 ? (
                        highScores.map((s, i) => (
                          <div key={i} className="flex justify-between items-center p-3 border-b border-black/5 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className="text-neutral-400 font-mono text-[10px]">#{i+1}</span>
                              <Trophy size={12} className={i === 0 ? 'text-yellow-600' : 'text-neutral-400'} />
                              <span className="text-[10px] font-bold text-neutral-500 uppercase">Registro_Score</span>
                            </div>
                            <span className="text-lg font-mono font-black text-red-900">{s}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-neutral-400 italic text-center text-xs">No hay expedientes registrados aún.</div>
                      )}
                    </div>
                    <div className="mt-4 text-[8px] text-neutral-400 uppercase tracking-tighter text-center">
                      *** Fin del reporte de inteligencia ***
                    </div>
                  </DossierWrapper>
                )}
              </div>
            </motion.div>
          )}

          {gameState === GameState.BRIEFING && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => startMission()}
              className="absolute inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-8 text-center cursor-pointer"
            >
              <div className="max-w-sm">
                <div className="w-16 h-1 bg-red-600 mb-8 mx-auto" />
                <h2 className="text-2xl font-black italic mb-6 tracking-tighter">INSTRUCCIONES DE MISIÓN</h2>
                <div className="text-lg leading-relaxed font-medium text-neutral-200 space-y-4">
                  <p>
                    <TypewriterText 
                      text="Recoge los archivos para recuperar estabilidad o ganar puntos, en caso de que la estabilidad este en 100." 
                      delay={30}
                    />
                  </p>
                  <p>
                    <TypewriterText 
                      text="Recoge por lo menos 2 discos para pasar exitosamente la misión, si recoges los 3 discos ganas 1000 puntos." 
                      delay={30}
                    />
                  </p>
                </div>
                <div className="mt-12 animate-pulse text-red-500 font-bold tracking-widest text-sm">
                  HAZ CLICK PARA COMENZAR
                </div>
              </div>
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
                    <motion.div
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <Trophy size={64} className="text-yellow-400 mb-4" />
                      <h2 className="text-4xl font-bold mb-2 text-emerald-400">
                        <TypewriterText text="MISSION COMPLETE" delay={50} />
                      </h2>
                      <p className="text-neutral-400 mb-6">
                        <TypewriterText text="Has llegado a la zona segura con todos los activos." />
                      </p>
                    </motion.div>
                  </>
                ) : (
                  <>
                    <motion.div
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <AlertTriangle size={64} className="text-red-500 mb-4" />
                      <h2 className="text-4xl font-bold mb-2 text-red-500">
                        <TypewriterText text="MISSION FAILED" delay={50} />
                      </h2>
                      <p className="text-neutral-400 mb-6">
                        <TypewriterText text={
                          time <= 0 ? "El tiempo ha expirado." : 
                          stability <= 0 ? "Vehículo destruido." : 
                          "Llegaste sin todos los objetos de la misión."
                        } />
                      </p>
                    </motion.div>
                  </>
                )}
                <div className="text-3xl font-mono mb-2">SCORE: {score}</div>
                <div className="text-neutral-400 mb-8 flex gap-4">
                  <span>Items: {missionItems}/3 {missionItems === 3 ? '(+1000 pts)' : ''}</span>
                  <span>Dist: {Math.round((distance / TARGET_DISTANCE) * 100)}%</span>
                </div>
                <button 
                  onClick={() => setGameState(GameState.MENU)}
                  className="flex items-center gap-2 px-8 py-4 bg-white text-black border border-white/10 rounded-full hover:bg-neutral-600 hover:text-neutral-100 transition-all text-lg font-bold cursor-pointer pointer-events-auto"
                >
                  <RefreshCw size={20} /> VOLVER AL MENÚ
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
