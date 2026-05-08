'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DishCard from './DishCard';
import AvatarDisplay from './AvatarDisplay';
import { Project } from '@/lib/types';

interface RoundState {
  isActive: boolean;
  currentChefIndex: number;
  order: string[];
  chefData: Record<string, { name: string; avatar: string }>;
  timeLeft: number;
  phase: 'social' | 'evaluation';
}

interface EvaluationRoundsProps {
  projects: Project[];
  historicalProjects: Project[];
  currentUser: { name: string; avatar: string; email?: string };
  isHost: boolean;
}

const EvaluationRounds: React.FC<EvaluationRoundsProps> = ({ projects, historicalProjects, currentUser, isHost }) => {
  const [round, setRound] = useState<RoundState | null>(null);
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    const newChannel = supabase.channel('room-state');

    newChannel
      .on('broadcast', { event: 'round-update' }, ({ payload }) => {
        setRound(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannel(newChannel);
        }
      });

    return () => {
      supabase.removeChannel(newChannel);
    };
  }, []);

  // Timer local para la ronda
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (round?.isActive && round.timeLeft > 0) {
      interval = setInterval(() => {
        setRound(prev => {
          if (!prev) return null;
          const nextTime = prev.timeLeft - 1;
          
          if (nextTime <= 0) {
            if (prev.phase === 'social') {
              // Transition to evaluation
              const newState: RoundState = { ...prev, phase: 'evaluation', timeLeft: 120 };
              if (isHost) {
                playBell();
                broadcastUpdate(newState);
              }
              return newState;
            } else {
              // End of evaluation
              if (isHost) {
                playBell();
                broadcastUpdate({ ...prev, timeLeft: 0 });
              }
              return { ...prev, timeLeft: 0 };
            }
          }
          
          if (isHost && nextTime % 5 === 0) {
            broadcastUpdate({ ...prev, timeLeft: nextTime });
          }
          
          return { ...prev, timeLeft: nextTime };
        });
      }, 1000);
    } else if (round?.timeLeft <= 0 && round?.isActive) {
      if (isHost) playBell();
    }
    return () => clearInterval(interval);
  }, [round?.isActive, round?.currentChefIndex, round?.phase, isHost, channel]);

  const playBell = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  const broadcastUpdate = (newState: RoundState | null) => {
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'round-update',
      payload: newState,
    });
  };

  const startRounds = () => {
    const chefsWithProjects = Array.from(new Set(projects.map(p => p.chef_id)));
    const shuffledChefs = [...chefsWithProjects].sort(() => Math.random() - 0.5);
    
    const chefData: Record<string, { name: string; avatar: string }> = {};
    shuffledChefs.forEach(id => {
      chefData[id] = { name: id, avatar: '👨‍🍳' };
    });

    const initialState: RoundState = {
      isActive: true,
      currentChefIndex: 0,
      order: shuffledChefs,
      chefData,
      timeLeft: 30,
      phase: 'social',
    };

    setRound(initialState);
    broadcastUpdate(initialState);
  };

  const nextChef = () => {
    if (!round) return;
    const nextIndex = round.currentChefIndex + 1;
    
    if (nextIndex >= round.order.length) {
      closeRounds();
    } else {
      const newState: RoundState = {
        ...round,
        currentChefIndex: nextIndex,
        timeLeft: 30,
        phase: 'social',
      };
      setRound(newState);
      broadcastUpdate(newState);
    }
  };

  const closeRounds = () => {
    setRound(null);
    broadcastUpdate(null);
  };

  if (!round?.isActive) {
    if (!isHost) return null;
    return (
      <div className="mb-8 flex justify-center">
        <button
          onClick={startRounds}
          className="bg-kitchen-hot hover:bg-red-600 px-8 py-4 rounded-2xl font-black text-xl shadow-xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 border-4 border-white/20"
        >
          🔥 INICIAR RONDAS DE EVALUACIÓN
        </button>
      </div>
    );
  }

  const currentChefId = round.order[round.currentChefIndex];
  const chefInfo = round.chefData[currentChefId];
  const chefProjects = projects.filter(p => p.chef_id === currentChefId);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-kitchen-steel flex flex-col p-8 animate-in fade-in duration-500 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <header className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            <div className={`w-24 h-24 flex items-center justify-center rounded-3xl border-2 shadow-inner overflow-hidden transition-colors ${round.phase === 'social' ? 'bg-kitchen-hot/20 border-kitchen-hot' : 'bg-white/5 border-white/10'}`}>
              <AvatarDisplay avatar={chefInfo?.avatar || '👨‍🍳'} className="w-16 h-16 text-6xl" />
            </div>
            <div>
              <span className={`font-mono text-sm tracking-[0.3em] uppercase mb-2 block transition-colors ${round.phase === 'social' ? 'text-kitchen-hot' : 'text-kitchen-cool'}`}>
                {round.phase === 'social' ? '💬 Personal Talk' : '👨‍🍳 Presentando Estación'}
              </span>
              <h2 className="text-6xl font-black tracking-tighter uppercase italic leading-none">{chefInfo?.name}</h2>
            </div>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className={`text-7xl font-mono font-black tabular-nums ${round.timeLeft < 20 ? 'text-kitchen-hot animate-pulse' : 'text-white'}`}>
              {formatTime(round.timeLeft)}
            </div>
            {isHost && (
              <div className="flex gap-4">
                <button
                  onClick={nextChef}
                  className="bg-kitchen-cool hover:bg-blue-600 px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                >
                  SIGUIENTE CHEF →
                </button>
                <button
                  onClick={closeRounds}
                  className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl font-bold transition-all border border-white/10"
                >
                  CERRAR
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1">
          <h3 className="text-white/40 font-mono text-xs uppercase tracking-[0.5em] mb-8 text-center">Evolución de Platos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {chefProjects.map(project => {
              const historical = historicalProjects.find(h => h.id === project.parent_id);
              
              return (
                <div key={project.id} className="bg-black/20 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <div className="flex justify-between items-center px-2">
                     <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                       {historical ? 'Comparativa Lunes vs Viernes' : 'Plato Nuevo (V1)'}
                     </span>
                     {project.version > 1 && (
                        <span className="bg-kitchen-cool text-[10px] px-2 py-0.5 rounded-full font-black italic">V{project.version}</span>
                     )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    {historical && (
                      <>
                        <div className="opacity-40 scale-90 grayscale contrast-125">
                          <div className="text-[8px] font-mono text-center mb-1 uppercase tracking-tighter">Lunes (V1)</div>
                          <DishCard project={historical} canEdit={false} />
                        </div>
                        <div className="text-3xl animate-pulse text-white/20 hidden sm:block">➡️</div>
                        <div className="sm:hidden text-2xl text-white/20">⬇️</div>
                      </>
                    )}
                    <div className="transform scale-105 shadow-2xl">
                      {historical && <div className="text-[8px] font-mono text-center mb-1 uppercase tracking-tighter text-kitchen-cool font-bold">Viernes (V2)</div>}
                      <DishCard project={project} canEdit={false} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="font-mono text-[10px] text-white/20 uppercase tracking-widest">
            Ronda {round.currentChefIndex + 1} de {round.order.length} | El equipo está degustando tu trabajo
          </p>
        </footer>
      </div>
    </div>
  );
};

export default EvaluationRounds;
