import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateBoard, BOARD_SIZE } from './utils/boardGen';
import { generateTileBag, drawTiles, LETTER_VALUES } from './utils/tileSystem';
import { CellData, LogicPhrase, LogicChain, Operator, P2PMessage } from './types';
import { BoardCell } from './components/BoardCell';
import { LogicDiagram } from './components/LogicDiagram';
import { RefreshCw, RotateCcw, BrainCircuit, Maximize, Minimize, Play, AlertCircle, Loader2, MapPin, User, Cpu, Zap, Lock, Unlock, Sparkles, Link, LayoutGrid, Info, Globe, Copy, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import Peer from 'peerjs';

// --- VISUAL SYNTHESIS COMPONENT ---
const HexCell = React.memo(({ letter, isCascade }: { letter: string | null, isCascade: boolean }) => {
  const targetValue = useMemo(() => 
    letter ? letter.charCodeAt(0).toString(16).toUpperCase() : '00'
  , [letter]);
  
  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevLetterRef = useRef(letter);

  useEffect(() => {
    if (prevLetterRef.current !== letter) {
      let frames = 0;
      const maxFrames = 10; // ~0.5s duration at 50ms intervals
      
      const interval = setInterval(() => {
        frames++;
        if (frames > maxFrames) {
          clearInterval(interval);
          setDisplayValue(targetValue);
        } else {
          // Random 2-digit hex
          setDisplayValue(Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0'));
        }
      }, 50);

      prevLetterRef.current = letter;
      return () => clearInterval(interval);
    }
  }, [letter, targetValue]);

  return (
    <div className={`
        flex items-center justify-center text-[10px] sm:text-xs md:text-sm lg:text-base leading-none select-none
        ${isCascade ? 'cascade-flash' : 'text-[#00FF41]'}
    `}>
        {displayValue}
    </div>
  );
});

// --- VALIDATION HELPER (Pure Function - No Wildcards) ---
const validatePlacementRules = (grid: CellData[][], gameMode: string, placementMode: string, dictionary: Set<string> | null): boolean => {
  if (!dictionary) return false;

  // 0. Isolation Check: No 1-letter words allowed (every tile must have at least one neighbor)
  for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
          if (grid[r][c].letter) {
              const hasHorz = (c > 0 && !!grid[r][c - 1].letter) || (c < BOARD_SIZE - 1 && !!grid[r][c + 1].letter);
              const hasVert = (r > 0 && !!grid[r - 1][c].letter) || (r < BOARD_SIZE - 1 && !!grid[r + 1][c].letter);
              if (!hasHorz && !hasVert) return false;
          }
      }
  }

  // 1. Connectivity Check (Acrostic Rule)
  if (placementMode === 'ACROSTIC') {
      const hasLockedTiles = grid.some(row => row.some(cell => cell.isLocked && cell.letter));
      
      if (hasLockedTiles) {
          const newTiles: {r: number, c: number}[] = [];
          for(let r=0; r<BOARD_SIZE; r++){
              for(let c=0; c<BOARD_SIZE; c++){
                  if(grid[r][c].letter && !grid[r][c].isLocked) {
                      newTiles.push({r, c});
                  }
              }
          }

          if (newTiles.length > 0) {
              let isConnected = false;
              for (const t of newTiles) {
                  const neighbors = [
                      {r: t.r-1, c: t.c},
                      {r: t.r+1, c: t.c},
                      {r: t.r, c: t.c-1},
                      {r: t.r, c: t.c+1}
                  ];
                  for (const n of neighbors) {
                      if (n.r >= 0 && n.r < BOARD_SIZE && n.c >= 0 && n.c < BOARD_SIZE) {
                          const neighborCell = grid[n.r][n.c];
                          if (neighborCell.letter && neighborCell.isLocked) {
                              isConnected = true;
                              break;
                          }
                      }
                  }
                  if (isConnected) break;
              }
              if (!isConnected) return false;
          }
      }
  }

  const checkLine = (cells: CellData[]) => {
     let currentWord = '';
     let currentWordMeta: boolean[] = [];

     for (let i = 0; i < cells.length; i++) {
       const cell = cells[i];
       if (cell.letter) {
         currentWord += cell.letter;
         currentWordMeta.push(!!cell.isLocked);
       } else {
         if (currentWord.length > 1) {
           if (!dictionary.has(currentWord)) return false;
           if (gameMode === 'FIXED') {
              const hasUnlocked = currentWordMeta.some(locked => !locked);
              if (hasUnlocked) {
                  let lockedRun = 0;
                  for (const locked of currentWordMeta) {
                      if (locked) {
                          lockedRun++;
                          if (lockedRun > 1) return false;
                      } else {
                          lockedRun = 0;
                      }
                  }
              }
           }
         }
         currentWord = '';
         currentWordMeta = [];
       }
     }
     if (currentWord.length > 1) {
        if (!dictionary.has(currentWord)) return false;
        if (gameMode === 'FIXED') {
           const hasUnlocked = currentWordMeta.some(locked => !locked);
           if (hasUnlocked) {
               let lockedRun = 0;
               for (const locked of currentWordMeta) {
                   if (locked) {
                       lockedRun++;
                       if (lockedRun > 1) return false;
                   } else {
                       lockedRun = 0;
                   }
               }
           }
        }
     }
     return true;
  };

  for (let r = 0; r < BOARD_SIZE; r++) {
     if (!checkLine(grid[r])) return false;
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
     const col = grid.map(row => row[c]);
     if (!checkLine(col)) return false;
  }

  return true;
};

// --- BLANK SOLVER HELPER ---
const resolveGridWithBlanks = (grid: CellData[][], gameMode: string, placementMode: string, dictionary: Set<string> | null): CellData[][] | null => {
    if (!dictionary) return null;

    const blankCoords: {r: number, c: number}[] = [];
    for(let r=0; r<BOARD_SIZE; r++){
        for(let c=0; c<BOARD_SIZE; c++){
            if(grid[r][c].letter === '*') {
                blankCoords.push({r, c});
            }
        }
    }

    if (blankCoords.length === 0) {
        return validatePlacementRules(grid, gameMode, placementMode, dictionary) ? grid : null;
    }

    const cloneGrid = (g: CellData[][]) => g.map(row => row.map(cell => ({...cell})));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const trySolve = (index: number, currentGrid: CellData[][]): CellData[][] | null => {
        if (index === blankCoords.length) {
            return validatePlacementRules(currentGrid, gameMode, placementMode, dictionary) ? currentGrid : null;
        }

        const {r, c} = blankCoords[index];
        
        for (let i = 0; i < alphabet.length; i++) {
            currentGrid[r][c].letter = alphabet[i];
            const result = trySolve(index + 1, currentGrid);
            if (result) return result;
        }
        
        currentGrid[r][c].letter = '*';
        return null;
    };

    return trySolve(0, cloneGrid(grid));
};

// --- SCORING HELPER (BASE) ---
const getWordScore = (word: string) => {
    let s = 0;
    for (const char of word) {
        s += LETTER_VALUES[char] || 0;
    }
    return s;
};

const calculateScrabbleScore = (currentGrid: CellData[][], newTiles: {r: number, c: number}[]) => {
    let totalScore = 0;
    const uniqueWords = new Set<string>();

    const getCellScore = (cell: CellData) => {
        if (cell.isBlank) return 0;
        return LETTER_VALUES[cell.letter || ''] || 0;
    };

    const scan = (r: number, c: number, dr: number, dc: number) => {
        let currR = r;
        let currC = c;
        while(
           currR - dr >= 0 && currR - dr < BOARD_SIZE && 
           currC - dc >= 0 && currC - dc < BOARD_SIZE && 
           currentGrid[currR - dr][currC - dc].letter
        ) {
            currR -= dr;
            currC -= dc;
        }
        const startR = currR;
        const startC = currC;
        
        const wordCells: CellData[] = [];
        while(
            currR >= 0 && currR < BOARD_SIZE && 
            currC >= 0 && currC < BOARD_SIZE && 
            currentGrid[currR][currC].letter
        ) {
            wordCells.push(currentGrid[currR][currC]);
            currR += dr;
            currC += dc;
        }
        
        if (wordCells.length > 1) {
            const id = `${dr===0?'H':'V'}:${startR}-${startC}`;
            if (!uniqueWords.has(id)) {
                uniqueWords.add(id);
                totalScore += wordCells.reduce((sum, cell) => sum + getCellScore(cell), 0);
            }
        }
    };

    newTiles.forEach(t => {
        if (currentGrid[t.r][t.c].letter) {
           scan(t.r, t.c, 0, 1);
           scan(t.r, t.c, 1, 0);
        }
    });
    return totalScore;
};

// --- LOGIC CHAIN EVALUATOR ---

interface CompiledOp {
    op: Operator;
    turn: number;          // When the operator tile itself was filled (for sorting priority)
    lastModifiedTurn: number; // When the word passing through it was last modified (for trigger check)
    word: string;
    id: string;
    wordScore: number;
    cellIds: string[];
}

interface WordMetadata {
    word: string;
    score: number;
    turn: number;
    cellIds: string[];
    clusterId: number;
}

interface CompiledChain {
    id: number;
    compiledOps: CompiledOp[];
    dataWords: string[];
}

const analyzeBoardLogic = (grid: CellData[][], dictionary: Set<string> | null, placementMode: 'ACROSTIC' | 'GO') => {
    // 1. Identify Clusters (if GO mode)
    const cellToCluster = new Map<string, number>();
    let nextClusterId = 1;

    if (placementMode === 'GO') {
        const visited = new Set<string>();
        const getNeighbors = (r: number, c: number) => 
            [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
            .filter(([nr,nc]) => nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE);

        for(let r=0; r<BOARD_SIZE; r++) {
            for(let c=0; c<BOARD_SIZE; c++) {
                const id = `${r}-${c}`;
                if (grid[r][c].letter && !visited.has(id)) {
                    const q = [{r,c}];
                    visited.add(id);
                    cellToCluster.set(id, nextClusterId);
                    
                    while(q.length) {
                        const curr = q.shift()!;
                        for(const n of getNeighbors(curr.r, curr.c)) {
                            const nid = `${n[0]}-${n[1]}`;
                            if (grid[n[0]][n[1]].letter && !visited.has(nid)) {
                                visited.add(nid);
                                cellToCluster.set(nid, nextClusterId);
                                q.push({r: n[0], c: n[1]});
                            }
                        }
                    }
                    nextClusterId++;
                }
            }
        }
    }

    const getClusterId = (cellIds: string[]) => {
        if (placementMode === 'ACROSTIC') return 1;
        return cellToCluster.get(cellIds[0]) || 0;
    };

    const rawOps: (CompiledOp & { clusterId: number })[] = [];
    const dataWords: { word: string, clusterId: number }[] = [];
    const allValidWords: WordMetadata[] = [];
    const visitedWords = new Set<string>();

    const scanLine = (cells: CellData[]) => {
      let currentWord = '';
      let currentScore = 0;
      let currentMaxTurn = 0;
      let currentOps: { op: Operator; turn: number; id: string }[] = [];
      let cellIds: string[] = [];

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.letter) {
          currentWord += cell.letter;
          currentScore += cell.isBlank ? 0 : (LETTER_VALUES[cell.letter] || 0);
          currentMaxTurn = Math.max(currentMaxTurn, cell.turnPlaced || 0);
          cellIds.push(cell.id);
          if (cell.operator && cell.operator !== Operator.START) {
            currentOps.push({ 
                op: cell.operator, 
                turn: cell.turnPlaced || 0,
                id: cell.id
            });
          }
        } else {
          if (currentWord.length > 1) {
             const isValid = dictionary ? dictionary.has(currentWord) : true;
             if (isValid) {
                 const uniqueKey = cellIds.join(',');
                 if (!visitedWords.has(uniqueKey)) {
                     visitedWords.add(uniqueKey);
                     const cId = getClusterId(cellIds);
                     
                     allValidWords.push({
                         word: currentWord,
                         score: currentScore,
                         turn: currentMaxTurn,
                         cellIds: [...cellIds],
                         clusterId: cId
                     });

                     if (currentOps.length === 0) {
                         dataWords.push({ word: currentWord, clusterId: cId });
                     } else {
                         currentOps.forEach(o => {
                             rawOps.push({ 
                                 ...o, 
                                 word: currentWord, 
                                 wordScore: currentScore,
                                 lastModifiedTurn: currentMaxTurn,
                                 cellIds: [...cellIds],
                                 clusterId: cId
                             });
                         });
                     }
                 }
             }
          }
          currentWord = '';
          currentScore = 0;
          currentMaxTurn = 0;
          currentOps = [];
          cellIds = [];
        }
      }
       if (currentWord.length > 1) {
          const isValid = dictionary ? dictionary.has(currentWord) : true;
          if (isValid) {
             const uniqueKey = cellIds.join(',');
             if (!visitedWords.has(uniqueKey)) {
                 visitedWords.add(uniqueKey);
                 const cId = getClusterId(cellIds);
                 
                 allValidWords.push({
                     word: currentWord,
                     score: currentScore,
                     turn: currentMaxTurn,
                     cellIds: [...cellIds],
                     clusterId: cId
                 });

                 if (currentOps.length === 0) {
                     dataWords.push({ word: currentWord, clusterId: cId });
                 } else {
                     currentOps.forEach(o => {
                         rawOps.push({ 
                             ...o, 
                             word: currentWord, 
                             wordScore: currentScore,
                             lastModifiedTurn: currentMaxTurn,
                             cellIds: [...cellIds],
                             clusterId: cId
                         });
                     });
                 }
             }
          }
       }
    };

    grid.forEach(row => scanLine(row));
    for (let c = 0; c < BOARD_SIZE; c++) {
      const col = grid.map(row => row[c]);
      scanLine(col);
    }

    const chains: CompiledChain[] = [];
    const maxCluster = placementMode === 'ACROSTIC' ? 1 : (nextClusterId - 1);

    for (let i = 1; i <= maxCluster; i++) {
        let clusterOps = rawOps.filter(x => x.clusterId === i);
        const clusterData = dataWords.filter(x => x.clusterId === i).map(x => x.word);
        
        if (clusterOps.length === 0 && clusterData.length === 0) continue;

        clusterOps.sort((a, b) => a.turn - b.turn);
        const compiledOps: CompiledOp[] = [];

        // Rule 1: First 'IF'
        const firstIf = clusterOps.find(x => x.op === Operator.IF);
        if (firstIf) compiledOps.push(firstIf);

        // Rule 2: All 'OR's
        const allOrs = clusterOps.filter(x => x.op === Operator.OR);
        allOrs.sort((a, b) => a.turn - b.turn);
        compiledOps.push(...allOrs);

        // Rule 3: First 'THEN'
        const firstThen = clusterOps.find(x => x.op === Operator.THEN);
        if (firstThen) compiledOps.push(firstThen);

        // Rule 4: All 'AND's and 'PLUS's
        const additions = clusterOps.filter(x => x.op === Operator.AND || x.op === Operator.PLUS);
        additions.sort((a, b) => a.turn - b.turn);
        compiledOps.push(...additions);

        // Rule 5: Math modifiers
        const modifiers = clusterOps.filter(x => [Operator.MINUS, Operator.MULT, Operator.OVER].includes(x.op));
        modifiers.sort((a, b) => a.turn - b.turn);
        compiledOps.push(...modifiers);

        chains.push({
            id: i,
            compiledOps,
            dataWords: clusterData
        });
    }

    return { chains, allValidWords };
};

const calculateChainScore = (chains: CompiledChain[], allValidWords: WordMetadata[], currentTurn: number): { score: number, activeCellIds: string[] } => {
    let totalLogicScore = 0;
    const activeCellIds = new Set<string>();

    for (const chain of chains) {
        const { compiledOps } = chain;
        
        // 1. Separate Triggers and Actions within this chain
        const triggers = compiledOps.filter(op => op.op === Operator.IF || op.op === Operator.OR);
        const actions = compiledOps.filter(op => op.op !== Operator.IF && op.op !== Operator.OR);

        if (triggers.length === 0 || actions.length === 0) continue;

        // 2. Pre-calculate the outcome
        let cascadeOutcome = 0;
        let targetEstablished = false;

        for (const action of actions) {
            if (action.op === Operator.THEN) {
                cascadeOutcome = action.wordScore;
                targetEstablished = true;
                continue;
            }
            if (targetEstablished) {
                switch (action.op) {
                    case Operator.PLUS:
                    case Operator.AND:
                        cascadeOutcome += action.wordScore;
                        break;
                    case Operator.MINUS:
                        cascadeOutcome -= action.wordScore;
                        break;
                    case Operator.MULT:
                        cascadeOutcome *= action.wordScore;
                        break;
                    case Operator.OVER:
                        if (action.wordScore !== 0) {
                            cascadeOutcome = Math.floor(cascadeOutcome / action.wordScore);
                        }
                        break;
                }
            }
        }

        if (!targetEstablished) continue;

        // 3. Identify newly formed words in this cluster
        const newlyFormedWords = allValidWords.filter(w => w.turn === currentTurn && w.clusterId === chain.id);
        
        // 4. Check against triggers
        for (const newWord of newlyFormedWords) {
            for (const trigger of triggers) {
                 if (newWord.word === trigger.word) {
                     totalLogicScore += cascadeOutcome;
                     newWord.cellIds.forEach(id => activeCellIds.add(id));
                     
                     compiledOps.forEach(op => {
                         op.cellIds.forEach(id => activeCellIds.add(id));
                     });
                 }
            }
        }
    }

    return { score: totalLogicScore, activeCellIds: Array.from(activeCellIds) };
};

const App: React.FC = () => {
  const [grid, setGrid] = useState<CellData[][]>([]);
  const [activeCell, setActiveCell] = useState<{ r: number, c: number } | null>(null);
  const [direction, setDirection] = useState<'H' | 'V'>('H');
  const [logicChains, setLogicChains] = useState<LogicChain[]>([]);
  
  // Game Modes
  const [gameMode, setGameMode] = useState<'DYNAMIC' | 'FIXED'>('DYNAMIC');
  const [placementMode, setPlacementMode] = useState<'ACROSTIC' | 'GO'>('ACROSTIC');
  const [turnCount, setTurnCount] = useState(1); 

  // P2P State
  const [playMode, setPlayMode] = useState<'VS_CPU' | 'P2P_HOST' | 'P2P_CLIENT'>('VS_CPU');
  // Use Refs for connection objects to prevent re-renders breaking the connection
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  const [myPeerId, setMyPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [joinInputId, setJoinInputId] = useState('');
  const [showMultiplayerMenu, setShowMultiplayerMenu] = useState(false);

  // Dictionary State
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const [dictByLetter, setDictByLetter] = useState<Record<string, string[]>>({});
  const [isLoadingDict, setIsLoadingDict] = useState(true);
  
  // Game State
  const [tileBag, setTileBag] = useState<string[]>([]);
  const [playerHand, setPlayerHand] = useState<string[]>([]);
  const [cpuHand, setCpuHand] = useState<string[]>([]); // acts as Opponent Hand in P2P
  const [turnMoves, setTurnMoves] = useState<{r: number, c: number, letter: string}[]>([]);
  const [isCpuTurn, setIsCpuTurn] = useState(false); // Functions as "Is Opponent Turn" in P2P
  
  // AI State
  const [cpuStatus, setCpuStatus] = useState('');
  
  // Score State
  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);

  // Visuals
  const [cascadeCellIds, setCascadeCellIds] = useState<Set<string>>(new Set());

  // Interaction State
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);

  // Full Screen State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sound Effects
  const tileSoundRef = useRef<HTMLAudioElement | null>(null);
  const successSoundRef = useRef<HTMLAudioElement | null>(null);

  // --- STATE REFS ---
  const stateRef = useRef({
    grid,
    playerHand,
    cpuHand,
    activeCell,
    direction,
    selectedTileIndex,
    turnMoves,
    isCpuTurn,
    tileBag,
    dictionary,
    dictByLetter,
    isLoadingDict,
    gameMode,
    placementMode,
    turnCount,
    playMode,
    playerScore,
    cpuScore
  });

  useEffect(() => {
    stateRef.current = {
      grid,
      playerHand,
      cpuHand,
      activeCell,
      direction,
      selectedTileIndex,
      turnMoves,
      isCpuTurn,
      tileBag,
      dictionary,
      dictByLetter,
      isLoadingDict,
      gameMode,
      placementMode,
      turnCount,
      playMode,
      playerScore,
      cpuScore
    };
  }, [grid, playerHand, cpuHand, activeCell, direction, selectedTileIndex, turnMoves, isCpuTurn, tileBag, dictionary, dictByLetter, isLoadingDict, gameMode, placementMode, turnCount, playMode, playerScore, cpuScore]);


  // Initialize Game
  useEffect(() => {
    tileSoundRef.current = new Audio('https://raw.githubusercontent.com/dsdtds/Wave2Joy/main/dominoeditwordplay2.wav');
    tileSoundRef.current.volume = 0.5;

    successSoundRef.current = new Audio('https://raw.githubusercontent.com/dsdtds/Wave2Joy/main/swish-edit85482.wav');
    successSoundRef.current.volume = 0.5;

    const loadDictionary = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/dsdtds/AI-Audiobook-Visualizer/main/Wordlist.txt');
        const text = await response.text();
        await new Promise(resolve => setTimeout(resolve, 100));

        const words = text.toUpperCase().split(/\s+/).filter(w => w.length > 0);
        const wordSet = new Set(words);
        setDictionary(wordSet);

        const index: Record<string, string[]> = {};
        words.forEach(w => {
           const uniqueChars = new Set(w.split(''));
           uniqueChars.forEach(char => {
              if (!index[char]) index[char] = [];
              index[char].push(w);
           });
        });
        setDictByLetter(index);

      } catch (error) {
        console.error("Failed to load dictionary:", error);
      } finally {
        setIsLoadingDict(false);
      }
    };
    loadDictionary();
    resetGame();
  }, []);

  // Cleanup Peer on unmount
  useEffect(() => {
      return () => {
          if (peerRef.current) peerRef.current.destroy();
      }
  }, []);

  // Full Screen Handler
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => {
            console.error(e);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  }, []);

  useEffect(() => {
      const handleFullScreenChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const resetGame = () => {
    setGrid(generateBoard());
    const initialBag = generateTileBag();
    const pDraw = drawTiles([], initialBag);
    const cDraw = drawTiles([], pDraw.bag);

    setTileBag(cDraw.bag);
    setPlayerHand(pDraw.hand);
    setCpuHand(cDraw.hand);
    setTurnMoves([]);
    setPlayerScore(0);
    setCpuScore(0);
    setActiveCell(null);
    setSelectedTileIndex(null);
    setDirection('H');
    setIsCpuTurn(false);
    setCpuStatus('');
    setTurnCount(1);
    setCascadeCellIds(new Set());
    // Don't reset playMode here to allow persisting P2P session start
  };

  const toggleGameMode = () => {
    setGameMode(prev => prev === 'DYNAMIC' ? 'FIXED' : 'DYNAMIC');
    resetGame();
  };

  const togglePlacementMode = () => {
    setPlacementMode(prev => prev === 'ACROSTIC' ? 'GO' : 'ACROSTIC');
    resetGame();
  };

  // --- P2P LOGIC ---

  const startHosting = () => {
      if (peerRef.current) peerRef.current.destroy();

      const p = new Peer();
      peerRef.current = p;
      setConnectionStatus('CONNECTING');

      p.on('open', (id) => {
          setMyPeerId(id);
          setPlayMode('P2P_HOST');
          setConnectionStatus('CONNECTING'); // Waiting for connection
      });

      p.on('connection', (connection) => {
          connRef.current = connection;
          setRemotePeerId(connection.peer);
          setConnectionStatus('CONNECTED');
          setShowMultiplayerMenu(false);
          
          // Host initializes the game state for the client
          const { grid, tileBag, playerHand, cpuHand, playerScore, cpuScore, turnCount } = stateRef.current;
          
          setTimeout(() => {
              connection.send({
                  type: 'INIT_GAME',
                  payload: {
                      grid,
                      tileBag,
                      playerHand: playerHand, // Send host's hand (client will see as opponent)
                      opponentHand: cpuHand,  // Send host's cpuHand (client will see as their hand)
                      playerScore,
                      opponentScore: cpuScore,
                      turnCount
                  }
              } as P2PMessage);
          }, 500);

          setupConnectionListeners(connection);
      });

      p.on('error', (err) => {
          console.error('PeerJS Error:', err);
          alert('Connection Error: ' + err.type);
          setConnectionStatus('DISCONNECTED');
      });
  };

  const joinGame = () => {
      if (!joinInputId) {
          alert("Please enter a Room ID");
          return;
      }
      
      if (peerRef.current) peerRef.current.destroy();

      const p = new Peer(); // Client needs their own identity
      peerRef.current = p;
      setConnectionStatus('CONNECTING');

      p.on('open', (id) => {
          setMyPeerId(id);
          const connection = p.connect(joinInputId);
          
          connection.on('open', () => {
              connRef.current = connection;
              setRemotePeerId(joinInputId);
              setConnectionStatus('CONNECTED');
              setPlayMode('P2P_CLIENT');
              setShowMultiplayerMenu(false);
              setupConnectionListeners(connection);
          });

          connection.on('error', (err) => {
               console.error('Connection Error:', err);
               alert('Could not connect to host.');
               setConnectionStatus('DISCONNECTED');
          });
      });

      p.on('error', (err) => {
          console.error('PeerJS Client Error:', err);
          alert('Network Error: ' + err.type);
          setConnectionStatus('DISCONNECTED');
      });
  };

  const setupConnectionListeners = (connection: any) => {
      connection.on('data', (data: P2PMessage) => {
          if (data.type === 'INIT_GAME' || data.type === 'TURN_COMMIT') {
             // Sync state
             // NOTE: We swap the hands and scores because "Player" in payload is the sender
             setGrid(data.payload.grid);
             setTileBag(data.payload.tileBag);
             setPlayerHand(data.payload.opponentHand); // Receiver gets the hand meant for them
             setCpuHand(data.payload.playerHand);      // Receiver sees sender's hand as opponent
             setPlayerScore(data.payload.opponentScore);
             setCpuScore(data.payload.playerScore);
             setTurnCount(data.payload.turnCount);
             
             // Unlock the board for my turn
             setIsCpuTurn(false);
             setCpuStatus('');
             
             if (successSoundRef.current) successSoundRef.current.play().catch(() => {});
          }
      });
      
      connection.on('close', () => {
          setConnectionStatus('DISCONNECTED');
          setPlayMode('VS_CPU');
          alert('Opponent disconnected.');
      });
  };

  const copyPeerId = () => {
      navigator.clipboard.writeText(myPeerId);
  };

  const disconnectP2P = () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
      setPlayMode('VS_CPU');
      setConnectionStatus('DISCONNECTED');
      setMyPeerId('');
      setRemotePeerId('');
      resetGame();
  };

  // --- VALIDATION & ANALYSIS ---
  
  const isBoardValid = useMemo(() => {
    const resolved = resolveGridWithBlanks(grid, gameMode, placementMode, dictionary);
    return resolved !== null;
  }, [grid, gameMode, placementMode, dictionary]);

  // Visual Analysis
  useEffect(() => {
    if (grid.length === 0) return;

    let analysisGrid = grid;
    const resolved = resolveGridWithBlanks(grid, gameMode, placementMode, dictionary);
    if (resolved) {
        analysisGrid = resolved;
    }

    const { chains } = analyzeBoardLogic(analysisGrid, dictionary, placementMode);
    
    const uiChains: LogicChain[] = chains.map(chain => {
        const chainPhrases: LogicPhrase[] = chain.compiledOps.map((item, idx) => ({
            id: `chain-${idx}-${item.id}`,
            word: item.word,
            operators: [{ op: item.op, indexInWord: 0 }],
            isValid: true
        }));
        
        const dataPhrases: LogicPhrase[] = chain.dataWords.map((w, idx) => ({
            id: `data-${idx}`,
            word: w,
            operators: [],
            isValid: true
        }));

        return {
            id: chain.id,
            phrases: [...chainPhrases, ...dataPhrases]
        };
    });

    setLogicChains(uiChains);

  }, [grid, dictionary, gameMode, placementMode]);

  // --- PLAYER ACTIONS ---

  const commitPlayerTurn = useCallback(() => {
    const { turnMoves, grid, playerHand, cpuHand, tileBag, gameMode, placementMode, dictionary, turnCount, playMode, playerScore, cpuScore } = stateRef.current;
    if (turnMoves.length === 0) return;

    const resolvedGrid = resolveGridWithBlanks(grid, gameMode, placementMode, dictionary);

    if (!resolvedGrid) {
        console.warn("Attempted to commit invalid grid");
        return;
    }

    if (successSoundRef.current) {
        successSoundRef.current.currentTime = 0;
        successSoundRef.current.play().catch(() => {});
    }

    // 1. Calculate Base Scrabble Score
    const baseScore = calculateScrabbleScore(resolvedGrid, turnMoves.map(m => ({r: m.r, c: m.c})));
    
    // 2. Lock grid (create the next state)
    const newGrid = [...resolvedGrid];
    turnMoves.forEach(move => {
      newGrid[move.r] = [...newGrid[move.r]];
      newGrid[move.r][move.c] = { 
          ...newGrid[move.r][move.c], 
          isLocked: true,
          turnPlaced: turnCount
      };
    });

    // 3. Calculate Logic Chain Bonus
    const { chains, allValidWords } = analyzeBoardLogic(newGrid, dictionary, placementMode);
    const logicBonus = calculateChainScore(chains, allValidWords, turnCount);

    if (logicBonus.score > 0) {
        setCascadeCellIds(new Set(logicBonus.activeCellIds));
        setTimeout(() => setCascadeCellIds(new Set()), 700);
    }

    const newScore = playerScore + baseScore + logicBonus.score;
    setPlayerScore(newScore);
    setGrid(newGrid);
    
    const nextTurnCount = turnCount + 1;
    setTurnCount(nextTurnCount);

    // 4. Refill Hand
    const { hand, bag } = drawTiles(playerHand, tileBag);
    setPlayerHand(hand);
    setTileBag(bag);
    
    // 5. Cleanup & State Transition
    setTurnMoves([]);
    setActiveCell(null);
    setSelectedTileIndex(null);
    
    // BRANCHING LOGIC FOR MODES
    if (playMode === 'VS_CPU') {
        setIsCpuTurn(true);
    } else {
        // In P2P, we lock our board and send the state
        setIsCpuTurn(true); // Locks interaction
        if (connRef.current) {
            connRef.current.send({
                type: 'TURN_COMMIT',
                payload: {
                    grid: newGrid,
                    tileBag: bag,
                    playerHand: hand,        // My hand
                    opponentHand: cpuHand,   // What I see as opponent hand (is their hand)
                    playerScore: newScore,
                    opponentScore: cpuScore,
                    turnCount: nextTurnCount
                }
            } as P2PMessage);
        }
    }

  }, []);

  const handlePass = useCallback(() => {
    const { playerHand, grid, turnMoves, tileBag, playMode, cpuHand, playerScore, cpuScore, turnCount } = stateRef.current;
    
    let lettersToReturn = [...playerHand];
    const newGrid = [...grid];
    turnMoves.forEach(move => {
        newGrid[move.r] = [...newGrid[move.r]];
        const cell = newGrid[move.r][move.c];
        const letterToReturn = cell.isBlank ? '*' : cell.letter;
        if (letterToReturn) lettersToReturn.push(letterToReturn);
        newGrid[move.r][move.c] = { ...newGrid[move.r][move.c], letter: null, isLocked: false, isBlank: false };
    });
    
    let newBag = [...tileBag, ...lettersToReturn];
    for (let i = newBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
    }
    
    const { hand, bag } = drawTiles([], newBag);
    setGrid(newGrid);
    setTurnMoves([]);
    setPlayerHand(hand);
    setTileBag(bag);
    setActiveCell(null);
    setIsCpuTurn(true); // Lock

    if (playMode === 'P2P_HOST' || playMode === 'P2P_CLIENT') {
        if (connRef.current) {
            connRef.current.send({
                type: 'TURN_COMMIT',
                payload: {
                    grid: newGrid,
                    tileBag: bag,
                    playerHand: hand,
                    opponentHand: cpuHand,
                    playerScore,
                    opponentScore: cpuScore,
                    turnCount
                }
            } as P2PMessage);
        }
    }

  }, []);

  const recallTiles = useCallback(() => {
    const { turnMoves, grid, playerHand } = stateRef.current;
    if (turnMoves.length === 0) return;
    
    const newGrid = [...grid];
    const lettersToReturn: string[] = [];
    turnMoves.forEach(move => {
        newGrid[move.r] = [...newGrid[move.r]];
        const cell = newGrid[move.r][move.c];
        const letterToReturn = cell.isBlank ? '*' : cell.letter;
        if (letterToReturn) lettersToReturn.push(letterToReturn);
        newGrid[move.r][move.c] = { ...newGrid[move.r][move.c], letter: null, isLocked: false, isBlank: false };
    });
    setGrid(newGrid);
    setPlayerHand([...playerHand, ...lettersToReturn]);
    setTurnMoves([]);
  }, []);

  // --- CPU AI LOGIC ---

  const passCpuTurn = useCallback(() => {
    const { cpuHand, tileBag } = stateRef.current;
    let newBag = [...tileBag, ...cpuHand];
    for (let i = newBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
    }
    const { hand, bag } = drawTiles([], newBag);
    setCpuHand(hand);
    setTileBag(bag);
    setIsCpuTurn(false);
    setCpuStatus('');
  }, []);

  useEffect(() => {
    if (isCpuTurn && playMode === 'VS_CPU' && !isLoadingDict) {
       performCpuTurnAsync();
    }
  }, [isCpuTurn, isLoadingDict, playMode]);

  const performCpuTurnAsync = async () => {
    setCpuStatus('Initializing...');
    await new Promise(r => setTimeout(r, 600));

    const { grid, cpuHand, tileBag, dictByLetter, turnCount, placementMode } = stateRef.current;
    
    // 1. Identify Anchors
    setCpuStatus('Scanning board...');
    const anchors: {r: number, c: number, letter: string}[] = [];
    let isFirstTurn = true;
    
    for (let r=0; r<BOARD_SIZE; r++) {
      for (let c=0; c<BOARD_SIZE; c++) {
        if (grid[r][c].letter && grid[r][c].isLocked) {
           anchors.push({r, c, letter: grid[r][c].letter!});
           isFirstTurn = false;
        }
      }
    }

    if (isFirstTurn) anchors.push({r: 5, c: 5, letter: ''});
    
    // If GO mode, we can start new clusters even if board isn't empty
    if (placementMode === 'GO' && !isFirstTurn && anchors.length < 5) {
         // Add some random empty spots as potential new cluster starts
         for(let i=0; i<3; i++) {
             anchors.push({
                 r: Math.floor(Math.random() * BOARD_SIZE),
                 c: Math.floor(Math.random() * BOARD_SIZE),
                 letter: ''
             });
         }
    }

    for (let i = anchors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
    }

    let bestMove: { word: string, pivot: number, anchor: {r: number, c: number, letter: string}, dir: 'H'|'V', score: number, aiScore: number } | null = null;
    const handFreq = getCharFrequency(cpuHand);
    
    const getCpuPreferenceScore = (score: number) => {
        return score; 
    };

    const maxAnchors = isFirstTurn ? 1 : 12; 
    
    for (let i = 0; i < Math.min(anchors.length, maxAnchors); i++) {
        const anchor = anchors[i];
        let candidateWords: string[] = [];
        if (anchor.letter) {
            setCpuStatus(`Analyzing anchor '${anchor.letter}'...`);
            candidateWords = [...(dictByLetter[anchor.letter] || [])];
            for (let i = candidateWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidateWords[i], candidateWords[j]] = [candidateWords[j], candidateWords[i]];
            }
        } else {
            setCpuStatus(`Searching opening moves...`);
            const uniqueHand = Array.from(new Set(cpuHand));
            uniqueHand.forEach(char => {
                if (char !== '*' && dictByLetter[char]) {
                     candidateWords.push(...dictByLetter[char]);
                }
            });
            candidateWords = candidateWords.filter(w => w.length <= 8);
            for (let i = candidateWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidateWords[i], candidateWords[j]] = [candidateWords[j], candidateWords[i]];
            }
            candidateWords = candidateWords.slice(0, 2000); 
        }

        candidateWords = candidateWords.filter(w => w.length <= 9 && w.length >= 2);
        candidateWords.sort((a, b) => b.length - a.length);

        let chunkStartTime = performance.now();
        
        for (let k = 0; k < candidateWords.length; k++) {
            const word = candidateWords[k];
            
            if (performance.now() - chunkStartTime > 10) {
                 await new Promise(r => setTimeout(r, 0));
                 chunkStartTime = performance.now();
                 if (k % 100 === 0) setCpuStatus(`Scanning...`);
            }
            
            if (!canMakeWord(word, handFreq, anchor.letter)) continue;

            const pivots = getPivots(word, anchor.letter);
            
            for (const pivot of pivots) {
                const scoreH = evaluatePlacement(word, pivot, anchor.r, anchor.c, 'H');
                if (scoreH > -1) {
                        const currentAiScore = getCpuPreferenceScore(scoreH);
                        if (!bestMove || currentAiScore > bestMove.aiScore) {
                            bestMove = { word, pivot, anchor, dir: 'H', score: scoreH, aiScore: currentAiScore };
                        }
                }
                
                const scoreV = evaluatePlacement(word, pivot, anchor.r, anchor.c, 'V');
                if (scoreV > -1) {
                        const currentAiScore = getCpuPreferenceScore(scoreV);
                        if (!bestMove || currentAiScore > bestMove.aiScore) {
                            bestMove = { word, pivot, anchor, dir: 'V', score: scoreV, aiScore: currentAiScore };
                        }
                }
            }
        }
    }

    if (bestMove) {
        setCpuStatus(`Found: ${bestMove.word}`);
        await new Promise(r => setTimeout(r, 400));
        executeMove(bestMove);
    } else {
        setCpuStatus("No moves found. Passing.");
        await new Promise(r => setTimeout(r, 1000));
        passCpuTurn();
    }
  };

  const getCharFrequency = (arr: string[]) => {
      const freq: Record<string, number> = {};
      for (const char of arr) freq[char] = (freq[char] || 0) + 1;
      return freq;
  };

  const canMakeWord = (word: string, handFreq: Record<string, number>, anchorChar: string | null) => {
      const needed: Record<string, number> = {};
      for (const char of word) needed[char] = (needed[char] || 0) + 1;
      if (anchorChar) {
          if (!needed[anchorChar]) return false;
          needed[anchorChar]--;
      }
      let blanksAvailable = handFreq['*'] || 0;
      for (const char in needed) {
          const count = needed[char];
          const has = handFreq[char] || 0;
          if (count > has) {
             const deficit = count - has;
             if (blanksAvailable >= deficit) {
                 blanksAvailable -= deficit;
             } else {
                 return false;
             }
          }
      }
      return true;
  };

  const getPivots = (word: string, anchorChar: string | null): number[] => {
      if (!anchorChar) return [Math.floor(word.length / 2)];
      const pivots: number[] = [];
      for (let i = 0; i < word.length; i++) {
          if (word[i] === anchorChar) pivots.push(i);
      }
      return pivots;
  };

  const evaluatePlacement = (word: string, pivotIdx: number, ar: number, ac: number, dir: 'H'|'V'): number => {
      const startR = dir === 'V' ? ar - pivotIdx : ar;
      const startC = dir === 'H' ? ac - pivotIdx : ac;

      if (startR < 0 || startC < 0) return -1;
      if (dir === 'H' && startC + word.length > BOARD_SIZE) return -1;
      if (dir === 'V' && startR + word.length > BOARD_SIZE) return -1;

      const { grid, gameMode, dictionary, placementMode, cpuHand, turnCount } = stateRef.current;
      const nextGrid = grid.map(row => row.map(cell => ({...cell})));
      let placedCount = 0;
      
      const newlyPlacedCoords: {r: number, c: number}[] = [];
      const tempHand = [...cpuHand];

      for (let k = 0; k < word.length; k++) {
          const r = dir === 'V' ? startR + k : startR;
          const c = dir === 'H' ? startC + k : startC;
          const char = word[k];
          const cell = nextGrid[r][c];

          if (cell.letter) {
              if (cell.letter !== char) return -1;
          } else {
              let isBlank = false;
              const idx = tempHand.indexOf(char);
              if (idx > -1) {
                  tempHand.splice(idx, 1);
              } else {
                  const bIdx = tempHand.indexOf('*');
                  if (bIdx > -1) {
                      tempHand.splice(bIdx, 1);
                      isBlank = true;
                  } else {
                      return -1;
                  }
              }

              cell.letter = char;
              cell.isLocked = true;
              cell.isBlank = isBlank;
              cell.turnPlaced = turnCount; // Track for logic chain trigger simulation
              placedCount++;
              newlyPlacedCoords.push({r, c});
          }
      }

      if (placedCount === 0) return -1;
      
      if (validatePlacementRules(nextGrid, gameMode, placementMode, dictionary)) {
          // Calculate Base
          const baseScore = calculateScrabbleScore(nextGrid, newlyPlacedCoords);
          
          // Calculate Logic Bonus
          const { chains, allValidWords } = analyzeBoardLogic(nextGrid, dictionary, placementMode);
          const logicBonus = calculateChainScore(chains, allValidWords, turnCount);
          
          return baseScore + logicBonus.score;
      }
      return -1;
  };

  const executeMove = (move: any) => {
       const { grid, cpuHand, tileBag, turnCount, dictionary, placementMode } = stateRef.current;
       const newGrid = [...grid];
       const newCpuHand = [...cpuHand];
       
       const newlyPlacedCoords: {r: number, c: number}[] = [];

       for (let k=0; k<move.word.length; k++) {
           const r = move.dir === 'V' ? move.anchor.r - move.pivot + k : move.anchor.r;
           const c = move.dir === 'H' ? move.anchor.c - move.pivot + k : move.anchor.c;
           const char = move.word[k];
           
           if (!newGrid[r][c].letter) {
              newGrid[r] = [...newGrid[r]];
              
              let isBlank = false;
              const hIdx = newCpuHand.indexOf(char);
              if (hIdx > -1) {
                 newCpuHand.splice(hIdx, 1);
              } else {
                 const bIdx = newCpuHand.indexOf('*');
                 if (bIdx > -1) {
                    newCpuHand.splice(bIdx, 1);
                    isBlank = true;
                 }
              }

              newGrid[r][c] = { 
                  ...newGrid[r][c], 
                  letter: char, 
                  isLocked: true,
                  isBlank: isBlank,
                  turnPlaced: turnCount
              };
              newlyPlacedCoords.push({r, c});
           }
       }
       
       // Calc Scores Independently to ensure accuracy and prevent double counting from heuristic
       const baseScore = calculateScrabbleScore(newGrid, newlyPlacedCoords);
       const { chains, allValidWords } = analyzeBoardLogic(newGrid, dictionary, placementMode);
       const logicBonus = calculateChainScore(chains, allValidWords, turnCount);

       if (logicBonus.score > 0) {
           setCascadeCellIds(new Set(logicBonus.activeCellIds));
           setTimeout(() => setCascadeCellIds(new Set()), 700);
       }

       setGrid(newGrid);
       setTurnCount(c => c + 1); 
       setCpuHand(newCpuHand);
       setCpuScore(s => s + baseScore + logicBonus.score);
       
       const draw = drawTiles(newCpuHand, tileBag);
       setCpuHand(draw.hand);
       setTileBag(draw.bag);
       setIsCpuTurn(false);
       setCpuStatus('');
  };

  const performTilePlacement = useCallback((r: number, c: number, letter: string, handIndex: number) => {
    const { grid, playerHand, direction, isCpuTurn } = stateRef.current;
    
    if (isCpuTurn) return; 
    
    const currentCell = grid[r][c];
    if (currentCell.isLocked) return;

    const newGrid = [...grid];
    newGrid[r] = [...newGrid[r]]; 

    let newHand = [...playerHand];
    
    const tileUsed = newHand[handIndex];
    const isBlank = tileUsed === '*';

    newHand.splice(handIndex, 1);

    if (currentCell.letter && !currentCell.isLocked) {
        const letterToReturn = currentCell.isBlank ? '*' : currentCell.letter;
        newHand.push(letterToReturn);
    }

    newGrid[r][c] = {
        ...currentCell,
        letter: letter,
        isLocked: false,
        isBlank: isBlank
    };

    setGrid(newGrid);
    setPlayerHand(newHand);
    
    if (tileSoundRef.current) {
        tileSoundRef.current.currentTime = 0;
        tileSoundRef.current.play().catch(() => {});
    }

    setTurnMoves(prev => {
        const filtered = prev.filter(m => !(m.r === r && m.c === c));
        return [...filtered, { r, c, letter }];
    });
    
    let nextR = r;
    let nextC = c;
    if (direction === 'H') {
        if (nextC < BOARD_SIZE - 1) nextC++;
    } else {
        if (nextR < BOARD_SIZE - 1) nextR++;
    }
    
    setActiveCell({ r: nextR, c: nextC });
    setSelectedTileIndex(null);
  }, []);

  const handleCellClick = useCallback((r: number, c: number) => {
    const { selectedTileIndex, playerHand, activeCell, grid, isCpuTurn } = stateRef.current;
    if (isCpuTurn) return;

    if (selectedTileIndex !== null) {
        const target = grid[r][c];
        if (!target.isLocked) {
             const tileInHand = playerHand[selectedTileIndex];
             performTilePlacement(r, c, tileInHand, selectedTileIndex);
             return; 
        }
    }

    if (activeCell?.r === r && activeCell?.c === c) {
      setDirection(prev => prev === 'H' ? 'V' : 'H');
    } else {
      setActiveCell({ r, c });
      setDirection('H');
    }
  }, [performTilePlacement]);

  const handleRackTileClick = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const { activeCell, grid, playerHand, isCpuTurn } = stateRef.current;
    if (isCpuTurn) return;
    
    if (activeCell) {
        const cell = grid[activeCell.r][activeCell.c];
        if (!cell.isLocked) {
            performTilePlacement(activeCell.r, activeCell.c, playerHand[index], index);
            return;
        }
    }
    setSelectedTileIndex(prev => prev === index ? null : index);
  }, [performTilePlacement]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (stateRef.current.isCpuTurn) return;
    e.dataTransfer.setData('tileIndex', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setSelectedTileIndex(index); 
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); 
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, r: number, c: number) => {
    e.preventDefault();
    if (stateRef.current.isCpuTurn) return;

    const { playerHand } = stateRef.current;
    const indexStr = e.dataTransfer.getData('tileIndex');
    if (!indexStr) return;
    
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0 || index >= playerHand.length) return;

    performTilePlacement(r, c, playerHand[index], index);
  }, [performTilePlacement]);


  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { activeCell, direction, grid, playerHand, isCpuTurn } = stateRef.current;
    if (isCpuTurn) return;
    
    if (e.key === 'Enter') {
      const { turnMoves, grid, isLoadingDict, isCpuTurn, gameMode, placementMode, dictionary } = stateRef.current;
      if (isCpuTurn || isLoadingDict || turnMoves.length === 0) return;

      const isFirstTurn = !grid.some(row => row.some(cell => cell.isLocked));
      const isStartCovered = !isFirstTurn || turnMoves.some(m => m.r === 5 && m.c === 5);
      
      // In GO mode, we don't strictly require start coverage if it's not the first turn, but the logic handles general validation.
      // However, validation rules might require connection if not GO.
      // The `canCommit` logic handles UI button, but hotkey bypasses it.
      // Let's rely on validation.
      if (!isStartCovered && placementMode !== 'GO') return;
      if (!isStartCovered && isFirstTurn) return;
      
      const resolved = resolveGridWithBlanks(grid, gameMode, placementMode, dictionary);
      if (resolved) {
          commitPlayerTurn();
      }
      return;
    }

    if (!activeCell) return;
    if (e.ctrlKey || e.metaKey) return;

    const currentCell = grid[activeCell.r][activeCell.c];

    if (/^[a-zA-Z*]$/.test(e.key)) {
      const char = e.key.toUpperCase();
      if (currentCell.letter === char) {
          if (direction === 'H') {
            if (activeCell.c < BOARD_SIZE - 1) setActiveCell({ r: activeCell.r, c: activeCell.c + 1 });
          } else {
            if (activeCell.r < BOARD_SIZE - 1) setActiveCell({ r: activeCell.r + 1, c: activeCell.c });
          }
          return;
      }
      if (currentCell.isLocked) return;
      
      let letterIndex = playerHand.indexOf(char);
      if (letterIndex === -1) {
          letterIndex = playerHand.indexOf('*');
      }

      if (letterIndex === -1) return;
      
      performTilePlacement(activeCell.r, activeCell.c, char, letterIndex);
    }

    if (e.key === 'Backspace') {
      let targetR = activeCell.r;
      let targetC = activeCell.c;

      if (!currentCell.letter) {
         if (direction === 'H' && targetC > 0) targetC--;
         if (direction === 'V' && targetR > 0) targetR--;
         setActiveCell({r: targetR, c: targetC});
         return;
      }
      if (currentCell.letter && !currentCell.isLocked) {
        const newGrid = [...grid];
        newGrid[targetR] = [...newGrid[targetR]]; 
        const cell = newGrid[targetR][targetC];
        
        const returnedTile = cell.isBlank ? '*' : cell.letter!;
        setPlayerHand(prev => [...prev, returnedTile]);
        
        newGrid[targetR][targetC] = { ...currentCell, letter: null, isBlank: false };
        setGrid(newGrid);
        setTurnMoves(prev => prev.filter(m => !(m.r === targetR && m.c === targetC)));
      }
    }

    if (e.key === 'ArrowRight' && activeCell.c < BOARD_SIZE - 1) setActiveCell({...activeCell, c: activeCell.c + 1});
    if (e.key === 'ArrowLeft' && activeCell.c > 0) setActiveCell({...activeCell, c: activeCell.c - 1});
    if (e.key === 'ArrowDown' && activeCell.r < BOARD_SIZE - 1) setActiveCell({...activeCell, r: activeCell.r + 1});
    if (e.key === 'ArrowUp' && activeCell.r > 0) setActiveCell({...activeCell, r: activeCell.r - 1});
  }, [performTilePlacement, commitPlayerTurn]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isFirstTurn = useMemo(() => {
    if (grid.length === 0) return true;
    return !grid.some(row => row.some(cell => cell.isLocked));
  }, [grid]);

  const isStartCovered = useMemo(() => {
    if (!isFirstTurn) return true; 
    return turnMoves.some(m => m.r === 5 && m.c === 5);
  }, [turnMoves, isFirstTurn]);

  const canCommit = turnMoves.length > 0 && isBoardValid && !isLoadingDict && !isCpuTurn && (placementMode === 'GO' ? (isFirstTurn ? isStartCovered : true) : isStartCovered);

  // --- LOGIC VISUALIZATION DRAWING ---
  const drawManhattanLines = (chains: LogicChain[]) => {
      const paths = [];
      let pathIdx = 0;
      
      chains.forEach(chain => {
          const chainPhrases = chain.phrases.filter(p => p.id.startsWith('chain')); 
          if (chainPhrases.length < 2) return;
          
          const coords = chainPhrases.map(p => {
              const parts = p.id.split('-');
              return {
                  r: parseInt(parts[2]),
                  c: parseInt(parts[3])
              };
          });

          for (let i = 0; i < coords.length - 1; i++) {
              const start = coords[i];
              const end = coords[i+1];
              const x1 = start.c + 0.5;
              const y1 = start.r + 0.5;
              const x2 = end.c + 0.5;
              const y2 = end.r + 0.5;
              const d = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`;
              paths.push(
                  <path key={`path-${pathIdx++}`} d={d} stroke="#00FF41" strokeWidth="0.05" fill="none" opacity="0.8" />
              );
          }
      });
      return paths;
  };


  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-950 text-slate-300 font-sans overflow-hidden">
      
      {/* LEFT: Sidebar / History */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          
          {/* Header with Title and Buttons */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-lg font-bold tracking-tighter text-[#E2B913] flex items-center gap-2">
                  <BrainCircuit className="text-amber-500" />
                  log(OS)
                </h1>
                
                {/* Tooltip */}
                <div className="relative group inline-flex items-center">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-amber-500 cursor-help transition-colors uppercase tracking-widest font-bold px-1 py-0.5 rounded hover:bg-slate-800">
                    <Info size={12} />
                    <span>Logic Rules</span>
                  </div>
                  
                  <div className="absolute left-0 top-full mt-2 w-72 p-4 bg-slate-950/95 backdrop-blur-xl border border-slate-700 rounded-lg shadow-2xl z-50 hidden group-hover:block text-xs font-mono animate-in fade-in zoom-in-95 duration-200">
                    <div className="text-amber-500 font-bold mb-3 uppercase tracking-widest border-b border-slate-800 pb-2">Logic Chain Evaluation</div>
                    <div className="space-y-2 text-slate-400">
                        <div className="flex gap-3">
                          <span className="text-amber-500 font-bold w-8 shrink-0 text-right">IF</span>
                          <span className="text-slate-300">First & only; only counted once.</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-amber-500 font-bold w-8 shrink-0 text-right">OR</span>
                          <span className="text-slate-300">Unlimited, directly after IF.</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-amber-500 font-bold w-8 shrink-0 text-right">THEN</span>
                          <span className="text-slate-300">First & only; only counted once.</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-cyan-500 font-bold w-8 shrink-0 text-right">AND</span>
                          <span className="text-slate-300">Unlimited, after THEN.</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-rose-500 font-bold w-8 shrink-0 text-right">MODS</span>
                          <span className="text-slate-300">plus, minus, mult, over: unlimited, in play order.</span>
                        </div>
                    </div>
                    
                    {/* Arrow pointing up to trigger */}
                    <div className="absolute left-4 -top-1 w-2 h-2 bg-slate-700/50 border-t border-l border-slate-700 rotate-45 transform" />
                  </div>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <button 
                  onClick={toggleGameMode}
                  className={`text-[10px] uppercase tracking-widest border border-slate-700 px-2 py-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 ${gameMode === 'DYNAMIC' ? 'text-emerald-500' : 'text-rose-500'}`}
                  title="Click to change between Fixed words or Dynamic words that can be extended"
                >
                  {gameMode === 'DYNAMIC' ? <Unlock size={10} /> : <Lock size={10} />}
                  {gameMode}
                </button>
                <button 
                  onClick={togglePlacementMode}
                  className={`text-[10px] uppercase tracking-widest border border-slate-700 px-2 py-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 ${placementMode === 'ACROSTIC' ? 'text-cyan-500' : 'text-fuchsia-500'}`}
                  title="Click to toggle between Acrostic (must connect) and Go (place anywhere) modes"
                >
                  {placementMode === 'ACROSTIC' ? <Link size={10} /> : <LayoutGrid size={10} />}
                  {placementMode}
                </button>
            </div>
          </div>
          
          {/* OPPONENT SCORE (TOP) */}
          <div className={`
             bg-slate-800/50 p-3 rounded border flex items-center justify-between transition-colors duration-500
             ${isCpuTurn ? 'border-amber-500/50 bg-amber-900/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-slate-700/50'}
          `}>
             <div className="flex items-center gap-3">
               <div className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${isCpuTurn ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  {playMode === 'VS_CPU' 
                    ? (isCpuTurn ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />)
                    : (connectionStatus === 'CONNECTED' ? <Globe size={16} className={isCpuTurn ? "animate-pulse" : ""} /> : <User size={16} />)
                  }
               </div>
               <div className="flex flex-col">
                 <span className={`text-[10px] uppercase tracking-widest font-bold ${isCpuTurn ? 'text-amber-500' : 'text-slate-500'}`}>
                    {playMode === 'VS_CPU' 
                        ? (isCpuTurn ? 'Thinking...' : 'Opponent')
                        : (connectionStatus === 'CONNECTED' 
                            ? (isCpuTurn ? 'Wait for Opponent' : 'Your Turn') 
                            : (connectionStatus === 'CONNECTING' ? 'Connecting...' : 'Disconnected'))
                    }
                 </span>
                 <span className="text-xs text-slate-400">
                    {playMode === 'VS_CPU' ? 'CPU-01' : (playMode === 'P2P_HOST' ? 'REMOTE-P2' : 'HOST-P1')}
                 </span>
               </div>
             </div>
             <span className="text-xl font-mono text-slate-500">
               {cpuScore.toString().padStart(3, '0')}
             </span>
          </div>

          {/* MULTIPLAYER CONTROLS */}
          {playMode === 'VS_CPU' && !showMultiplayerMenu && (
             <button 
                onClick={() => setShowMultiplayerMenu(true)}
                className="w-full mt-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 py-1 rounded border border-slate-700 flex items-center justify-center gap-2"
             >
                <Wifi size={12} /> Play Multiplayer
             </button>
          )}

          {showMultiplayerMenu && playMode === 'VS_CPU' && (
             <div className="mt-3 p-3 bg-slate-950 rounded border border-slate-700 shadow-xl relative z-30">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 tracking-wider">MULTIPLAYER SETUP</span>
                    <button onClick={() => setShowMultiplayerMenu(false)} className="text-slate-600 hover:text-slate-300">✕</button>
                </div>
                
                {/* HOST SECTION */}
                <div className="mb-4">
                     <div className="text-[10px] uppercase text-emerald-600 font-bold mb-1">Host Game</div>
                     <button onClick={startHosting} className="w-full text-xs bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-900 py-2 rounded flex items-center justify-center gap-2 transition-colors">
                        <Globe size={12} /> Start Hosting (Get ID)
                    </button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                    <div className="h-px bg-slate-800 flex-1"></div>
                    <span className="text-[10px] text-slate-600">OR</span>
                    <div className="h-px bg-slate-800 flex-1"></div>
                </div>

                {/* JOIN SECTION */}
                <div>
                    <div className="text-[10px] uppercase text-cyan-600 font-bold mb-1">Join Game</div>
                    <div className="flex gap-1 w-full">
                        <input 
                            value={joinInputId}
                            onChange={(e) => setJoinInputId(e.target.value)}
                            placeholder="Paste Host ID..."
                            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700"
                        />
                        <button onClick={joinGame} className="text-xs bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 border border-cyan-900 px-3 rounded shrink-0">Join</button>
                    </div>
                </div>
             </div>
          )}

          {playMode !== 'VS_CPU' && (
             <div className="mt-3 p-3 bg-slate-950 rounded border border-slate-700">
                 <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                     <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                        <span className="uppercase font-bold tracking-wider">{connectionStatus === 'CONNECTED' ? 'LIVE SESSION' : 'WAITING...'}</span>
                     </div>
                 </div>

                 {/* ID DISPLAY */}
                 <div className="bg-slate-900 p-2 rounded border border-slate-800 mb-3">
                     <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-600 uppercase">My Room ID:</span>
                        <button onClick={copyPeerId} className="text-[10px] text-emerald-500 hover:text-emerald-400 flex items-center gap-1">
                            <Copy size={10} /> COPY
                        </button>
                     </div>
                     <div className="font-mono text-xs text-slate-300 break-all select-all">
                        {myPeerId || 'Generating ID...'}
                     </div>
                 </div>

                 {playMode === 'P2P_CLIENT' && (
                     <div className="mb-3 text-[10px] text-slate-500">
                        Connected to Host: <span className="font-mono text-slate-400">{remotePeerId}</span>
                     </div>
                 )}

                 <button onClick={disconnectP2P} className="w-full text-[10px] bg-rose-900/20 text-rose-500 hover:bg-rose-900/40 border border-rose-900/30 py-2 rounded flex items-center justify-center gap-2 transition-colors">
                     <WifiOff size={12} /> DISCONNECT
                 </button>
             </div>
          )}

        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
           <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">System Log</div>
            
            {activeCell && (
               <div className="text-xs font-mono text-slate-400 border-l-2 border-amber-500/50 pl-2 bg-amber-900/10 py-1">
                 <span className="text-amber-500 font-bold">TARGET:</span> {activeCell.r + 1},{activeCell.c + 1}
                 {grid[activeCell.r] && grid[activeCell.r][activeCell.c].operator && grid[activeCell.r][activeCell.c].operator !== Operator.START && (
                   <span className="text-slate-500 ml-2">[{grid[activeCell.r][activeCell.c].operator}]</span>
                 )}
               </div>
            )}

            {logicChains.length === 0 ? (
              !activeCell && <div className="text-xs text-slate-700 italic">No patterns detected.</div>
            ) : (
              <div className="space-y-2">
                {logicChains.map((c, i) => (
                    c.phrases.map((p, j) => (
                      <div key={`${i}-${j}`} className="text-xs font-mono text-slate-400 border-l border-slate-700 pl-2">
                        <span className="text-emerald-500">COMPILE [C{c.id}]:</span> {p.word}
                      </div>
                    ))
                ))}
              </div>
            )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
           {/* PLAYER SCORE (BOTTOM) */}
           <div className={`
              bg-emerald-900/10 p-3 rounded border mb-4 flex items-center justify-between transition-all
              ${!isCpuTurn ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-slate-800 opacity-50'}
           `}>
             <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded bg-emerald-900/30 flex items-center justify-center text-emerald-400">
                  <User size={16} />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] text-emerald-500/70 uppercase tracking-widest font-bold">Active</span>
                 <span className="text-xs text-emerald-400 font-bold">
                    {playMode === 'VS_CPU' ? 'PLAYER 1' : (playMode === 'P2P_HOST' ? 'HOST (YOU)' : 'CLIENT (YOU)')}
                 </span>
               </div>
             </div>
             <span className="text-2xl font-mono text-emerald-400 font-bold">
               {playerScore.toString().padStart(3, '0')}
             </span>
          </div>

          <div className="flex gap-2">
            <button 
                onClick={commitPlayerTurn}
                disabled={!canCommit}
                className={`
                h-12 px-6 rounded font-bold tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg flex-1
                ${canCommit 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white translate-y-0' 
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed translate-y-1 shadow-none'}
                ${(!isBoardValid || (!isStartCovered && placementMode !== 'GO')) && turnMoves.length > 0 ? 'bg-rose-900/50 text-rose-500 border border-rose-900' : ''}
                `}
            >
                {isLoadingDict ? (
                <Loader2 size={16} className="animate-spin" />
                ) : !isStartCovered && placementMode !== 'GO' ? (
                <>CENTER <MapPin size={16} /></>
                ) : !isBoardValid && turnMoves.length > 0 ? (
                <>INVALID <AlertCircle size={16} /></>
                ) : (
                <>PLAY <Play size={16} fill="currentColor" /></>
                )}
            </button>

            <button
                onClick={toggleFullScreen}
                className="h-12 w-12 flex items-center justify-center rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-lg"
                title={isFullscreen ? "Exit Full Screen" : "Enter Full Screen"}
            >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER: The Board */}
      <main className="flex-1 flex flex-col items-center justify-center bg-[#0B1120] relative p-4 md:p-8">
        
        {/* Background ambience */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/50 to-transparent opacity-50" />
        
        {/* Board Container */}
        <div className="relative z-10 max-w-2xl w-full aspect-square bg-slate-900/50 p-2 md:p-4 rounded shadow-2xl border border-slate-800 backdrop-blur-sm mb-4">
          <div 
            className={`grid w-full h-full gap-px bg-slate-800 border border-slate-700 transition-opacity ${isCpuTurn ? 'opacity-90' : 'opacity-100'}`}
            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
          >
            {grid.map((row, rIdx) => (
              row.map((cell, cIdx) => (
                <BoardCell 
                  key={cell.id} 
                  data={cell} 
                  isActive={activeCell?.r === rIdx && activeCell?.c === cIdx}
                  direction={direction}
                  onClick={handleCellClick}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                />
              ))
            ))}
          </div>

          {isCpuTurn && playMode === 'VS_CPU' && (
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50">
                <div className="bg-slate-900/90 backdrop-blur-md px-8 py-4 rounded-xl border border-amber-500/30 flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                   <div className="flex items-center gap-3">
                       <Loader2 className="text-amber-500 animate-spin" size={24} />
                       <span className="text-amber-100 font-mono tracking-widest text-lg font-bold">AI THINKING</span>
                   </div>
                   <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                   <span className="text-amber-500/80 font-mono text-xs uppercase tracking-wider animate-pulse">
                      {cpuStatus || "INITIALIZING PROCESS..."}
                   </span>
                </div>
             </div>
          )}

          {isCpuTurn && playMode !== 'VS_CPU' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50">
                <div className="bg-slate-900/90 backdrop-blur-md px-8 py-4 rounded-xl border border-amber-500/30 flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-3">
                        <Globe className="text-amber-500 animate-pulse" size={24} />
                        <span className="text-amber-100 font-mono tracking-widest text-lg font-bold">OPPONENT TURN</span>
                    </div>
                </div>
              </div>
          )}

        </div>

        {/* TILE RACK UI */}
        <div className={`w-full max-w-2xl z-20 flex items-center gap-4 transition-all duration-500 ${isCpuTurn ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
          
          {/* Controls Left */}
          <div className="flex gap-2">
             <button 
                onClick={recallTiles}
                disabled={turnMoves.length === 0}
                className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Recall Tiles"
             >
               <RotateCcw size={16} />
             </button>
          </div>

          {/* The Rack */}
          <div className="flex-1 h-20 md:h-24 bg-[#1e1b18] border-b-4 border-[#3e342e] rounded-sm shadow-xl flex items-end justify-center px-4 relative transition-all">
             <div className="flex gap-2 md:gap-3 mb-2 md:mb-3">
               {playerHand.map((letter, idx) => (
                 <div 
                   key={idx}
                   draggable={!isCpuTurn}
                   onDragStart={(e) => handleDragStart(e, idx)}
                   onClick={(e) => handleRackTileClick(idx, e)}
                   className={`
                      w-10 h-12 md:w-14 md:h-16 rounded-[2px] shadow-sm flex items-center justify-center 
                      font-serif font-bold text-2xl md:text-4xl border-b-[3px] md:border-b-[5px] select-none 
                      transition-transform
                      ${selectedTileIndex === idx 
                        ? 'bg-[#f0f0e0] text-rose-600 border-rose-400 -translate-y-2 ring-2 ring-rose-500' 
                        : 'bg-[#e5e5d5] text-slate-900 border-[#b8b8a8]'}
                      ${!isCpuTurn ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1' : 'cursor-default'}
                   `}
                 >
                    {letter === '*' ? (
                       <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-rose-500" />
                    ) : letter}
                 </div>
               ))}
               {Array.from({ length: 7 - playerHand.length }).map((_, i) => (
                 <div key={`empty-${i}`} className="w-10 h-12 md:w-14 md:h-16 bg-white/5 border-2 border-dashed border-white/10 rounded-[2px]" />
               ))}
             </div>
          </div>

          {/* Controls Right */}
          <div className="flex gap-2">
            <button 
              onClick={handlePass}
              className="h-12 px-4 bg-slate-800 rounded border border-slate-700 text-slate-400 font-bold tracking-widest hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-2"
              title="Pass & Swap Tiles"
            >
              PASS
            </button>

            <button 
              onClick={commitPlayerTurn}
              disabled={!canCommit}
              className={`
                h-12 px-6 rounded font-bold tracking-widest flex items-center gap-2 transition-all shadow-lg
                ${canCommit 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white translate-y-0' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed translate-y-1 shadow-none'}
                ${(!isBoardValid || (!isStartCovered && placementMode !== 'GO')) && turnMoves.length > 0 ? 'bg-rose-900/50 text-rose-500 border border-rose-900' : ''}
              `}
            >
               {isLoadingDict ? (
                <Loader2 size={16} className="animate-spin" />
              ) : !isStartCovered && placementMode !== 'GO' ? (
                <>CENTER <MapPin size={16} /></>
              ) : !isBoardValid && turnMoves.length > 0 ? (
                <>INVALID <AlertCircle size={16} /></>
              ) : (
                <>PLAY <Play size={16} fill="currentColor" /></>
              )}
            </button>
          </div>

          {/* Direction Indicator (Floating) */}
          <div className="absolute right-0 -top-12 flex space-x-4">
           <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-full text-xs font-mono flex items-center gap-2 text-slate-400">
             <span className={direction === 'H' ? 'text-white' : ''}>HORZ</span>
             <RotateCcw size={12} className={direction === 'V' ? 'rotate-90 transition-transform' : 'transition-transform'} />
             <span className={direction === 'V' ? 'text-white' : ''}>VERT</span>
           </div>
        </div>

        </div>

      </main>

      {/* RIGHT: Output & Visualization */}
      <aside className="w-full md:w-80 bg-slate-950 border-l border-slate-800 flex flex-col z-20">
        
        {/* Top: Logic Schematic */}
        <div className="flex-1 border-b border-slate-800 overflow-y-auto bg-slate-900/30">
          <LogicDiagram chains={logicChains} />
        </div>

        {/* Bottom: Hex Visual Synthesis */}
        <div className="h-[45%] relative bg-black flex flex-col p-4 group">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 flex justify-between">
            <span>Visual Synthesis</span>
            <Maximize size={12} className="text-slate-700" />
          </div>

          <div className="flex-1 relative border border-slate-800 rounded overflow-hidden bg-black font-vt323 p-2">
            {/* SVG Layer for Logic Lines */}
            <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-60" viewBox="0 0 11 11" preserveAspectRatio="none">
                {drawManhattanLines(logicChains)}
            </svg>

            {/* Hex Grid Layer */}
            <div className="grid grid-cols-11 grid-rows-11 w-full h-full z-0">
                {grid.map((row) => row.map((cell) => (
                    <HexCell key={cell.id} letter={cell.letter} isCascade={cascadeCellIds.has(cell.id)} />
                )))}
            </div>
          </div>
          
          <div className="mt-2 flex justify-between items-center text-[10px] text-slate-700 font-mono">
             <span>LAT: {logicChains.reduce((acc, c) => acc + c.phrases.length, 0) * 12}ms</span>
             <span>BUFFER: OK</span>
          </div>
        </div>
      </aside>

    </div>
  );
};

export default App;