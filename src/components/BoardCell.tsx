import React from 'react';
import { CellData, Operator } from '../types';
import { ChevronRight, ChevronDown, Sparkles } from 'lucide-react';

interface BoardCellProps {
  data: CellData;
  isActive: boolean;
  direction?: 'H' | 'V';
  onClick: (r: number, c: number) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, r: number, c: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export const BoardCell: React.FC<BoardCellProps> = React.memo(({ 
  data, 
  isActive, 
  direction = 'H', 
  onClick, 
  onDrop, 
  onDragOver 
}) => {
  // Styles for different operators
  const getOpStyle = (op: Operator) => {
    switch (op) {
      case Operator.IF:
      case Operator.THEN:
      case Operator.OR:
        return { text: 'text-amber-500', bg: 'bg-amber-900/20', border: 'border-amber-700/30' };
      case Operator.AND:
        return { text: 'text-cyan-500', bg: 'bg-cyan-900/20', border: 'border-cyan-700/30' };
      case Operator.PLUS:
      case Operator.MINUS:
        return { text: 'text-rose-500', bg: 'bg-rose-900/20', border: 'border-rose-700/30' };
      case Operator.MULT:
      case Operator.OVER:
        return { text: 'text-violet-500', bg: 'bg-violet-900/20', border: 'border-violet-700/30' };
      case Operator.START:
        return { text: 'text-emerald-500', bg: 'bg-emerald-900/20', border: 'border-emerald-700/30' };
      default:
        return { text: 'text-slate-500', bg: 'bg-transparent', border: 'border-slate-800' };
    }
  };

  const opStyle = data.operator ? getOpStyle(data.operator) : null;

  return (
    <div
      onClick={() => onClick(data.row, data.col)}
      onDrop={(e) => onDrop && onDrop(e, data.row, data.col)}
      onDragOver={onDragOver}
      className={`
        relative w-full h-full aspect-square border 
        flex items-center justify-center cursor-pointer overflow-hidden
        transition-all duration-200 group
        ${isActive ? 'ring-2 ring-white z-20 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'hover:bg-slate-800/50'}
        ${opStyle ? opStyle.bg : 'bg-slate-900'}
        ${opStyle ? opStyle.border : 'border-slate-800'}
      `}
    >
      {/* START TILE HINT PULSE */}
      {data.operator === Operator.START && !data.letter && (
         <div className="absolute inset-0 border-2 border-emerald-400/60 animate-pulse shadow-[inset_0_0_15px_rgba(16,185,129,0.3)] pointer-events-none z-10" />
      )}

      {/* LAYER 1: The Operator (Base Layer) */}
      {data.operator && (
        <div className={`absolute inset-0 flex items-center justify-center select-none z-0 ${opStyle?.text}`}>
          <span className="font-mono text-[10px] md:text-xs font-bold tracking-widest opacity-80">
            {data.operator}
          </span>
          {/* Decorative corners for operators */}
          <div className={`absolute top-0 left-0 w-2 h-2 border-t border-l ${opStyle?.border} opacity-50`} />
          <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${opStyle?.border} opacity-50`} />
        </div>
      )}

      {/* LAYER 2: The Letter Tile (Top Layer) */}
      {data.letter && (
        <div className={`
          absolute inset-[2px] z-10 
          flex items-center justify-center 
          shadow-lg rounded-[1px]
          transition-all duration-300 ease-in-out
          /* Locked (Committed) tiles are classic cream. Pending tiles are slightly brighter/ghostly */
          ${data.isLocked 
            ? 'bg-[#e5e5d5] text-slate-900' 
            : 'bg-[#f0f0e0] text-rose-900 ring-1 ring-rose-500/50'}
          /* THE CRITICAL MECHANIC: Reveal operator on hover - ONLY IF OPERATOR EXISTS */
          ${data.operator ? 'group-hover:translate-y-[-2px] group-hover:bg-[#e5e5d5]/10 group-hover:text-transparent group-hover:backdrop-blur-none' : ''}
        `}>
          {/* The visible letter - Increased size. Hidden on hover ONLY if operator exists. */}
          {data.letter === '*' ? (
             <Sparkles className={`w-6 h-6 md:w-8 md:h-8 text-rose-500 animate-pulse ${data.operator ? 'group-hover:hidden' : ''}`} />
          ) : (
            <span className={`font-serif text-2xl md:text-3xl font-bold ${data.operator ? 'group-hover:hidden' : ''} ${data.isBlank ? 'italic' : ''}`}>
              {data.letter}
            </span>
          )}
          
          {/* Pending indicator dot */}
          {!data.isLocked && (
             <div className="absolute top-1 right-1 w-1 h-1 bg-rose-500 rounded-full" />
          )}
          
          {/* Blank Tile Indicator (Small diamond for letters that are actually blanks) */}
          {data.isBlank && data.letter !== '*' && (
             <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-rose-400 rotate-45" title="Wildcard Tile" />
          )}

          {/* Subtle marking indicating hidden operator beneath */}
          {data.operator && (
            <div className={`absolute bottom-0 right-0 w-3 h-3 ${opStyle?.text.replace('text-', 'bg-')} clip-triangle opacity-100 group-hover:opacity-0`} style={{clipPath: 'polygon(100% 0, 0% 100%, 100% 100%)'}} />
          )}
        </div>
      )}

      {/* Direction Indicator (Only on Active Cell) */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
          {direction === 'H' ? (
             <ChevronRight size={16} className="text-rose-500/80 translate-x-3 md:translate-x-4 animate-pulse" />
          ) : (
             <ChevronDown size={16} className="text-rose-500/80 translate-y-3 md:translate-y-4 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
});