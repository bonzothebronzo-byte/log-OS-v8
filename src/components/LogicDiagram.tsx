import React from 'react';
import { Operator, LogicChain } from '../types';
import { GitCommit, Network } from 'lucide-react';

interface LogicDiagramProps {
  chains: LogicChain[];
}

export const LogicDiagram: React.FC<LogicDiagramProps> = ({ chains }) => {
  const getOpColor = (op: Operator) => {
    switch (op) {
      case Operator.IF:
      case Operator.THEN:
      case Operator.OR:
        return 'text-amber-500';
      case Operator.AND:
        return 'text-cyan-500';
      case Operator.PLUS:
      case Operator.MINUS:
        return 'text-rose-500';
      case Operator.MULT:
      case Operator.OVER:
        return 'text-violet-500';
      case Operator.START:
        return 'text-emerald-500';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      <div className="flex items-center space-x-2 text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-2 mb-2 px-4 pt-4">
        <GitCommit size={14} />
        <span>Circuit Trace</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
        {chains.length === 0 ? (
          <div className="text-slate-600 italic">No logic gates active.</div>
        ) : (
          chains.map((chain) => (
             <div key={chain.id} className="relative pl-4 border-l-2 border-slate-800">
                {/* Chain ID / Header */}
                <div className="absolute -left-[5px] -top-1 w-2.5 h-2.5 bg-slate-800 rounded-full" />
                <div className="mb-2 text-[10px] text-slate-600 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Network size={10} />
                    CLUSTER {chain.id}
                </div>

                <div className="flex flex-wrap items-center gap-y-2 leading-relaxed">
                   {chain.phrases.map((phrase, i) => (
                      <React.Fragment key={`${phrase.id}-${i}`}>
                        <div className={`group inline-flex items-center rounded px-1.5 py-0.5 transition-all ${
                            phrase.isValid ? 'hover:bg-slate-800' : 'bg-rose-900/10'
                        }`}>
                          {/* Logic Modifiers */}
                          {phrase.operators.length > 0 ? (
                            <div className="flex items-center">
                                {phrase.operators.map((op, idx) => (
                                    <span key={idx} className={`${getOpColor(op.op)} font-bold mr-1`}>
                                    {op.op}
                                    </span>
                                ))}
                            </div>
                          ) : (
                            <span className="text-slate-600 font-bold mr-1">DATA</span>
                          )}

                          <span className="text-slate-500 mr-1.5">:</span>

                          {/* The Word */}
                          <span className={`font-serif text-sm ${
                              phrase.isValid ? 'text-slate-200 font-semibold' : 'text-rose-500 line-through decoration-rose-500/40'
                          }`}>
                            {phrase.word}
                          </span>
                        </div>

                        {/* Arrow Connector */}
                        {i < chain.phrases.length - 1 && (
                           <span className="mx-1 text-slate-700 font-sans">→</span>
                        )}
                      </React.Fragment>
                   ))}
                    {/* Blinking Cursor per chain */}
                    <span className="inline-block w-2 h-4 bg-emerald-500/50 ml-2 animate-pulse align-middle" />
                </div>
                
                 {/* Footer Stats per chain */}
                 <div className="mt-2 pt-1 border-t border-slate-800/50 text-[10px] text-slate-600 flex gap-4">
                    <span>OPS: {chain.phrases.reduce((acc, p) => acc + p.operators.length, 0)}</span>
                    <span>LEN: {chain.phrases.length}</span>
                 </div>
             </div>
          ))
        )}
      </div>
    </div>
  );
};