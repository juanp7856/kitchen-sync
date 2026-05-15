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
    } else if (round && round.isActive && round.timeLeft <= 0) {
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
    <div className="fixed inset-0 z-[200] bg-kitchen-steel flex flex-col animate-in fade-in duration-500 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col p-8">
        <header className="sticky top-0 z-50 bg-kitchen-steel/80 backdrop-blur-md flex justify-between items-center mb-12 border-b border-white/10 pb-8 -mx-8 px-8">
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

        <div className="flex-1 flex flex-col items-center">
          <h3 className="text-white/40 font-mono text-[10px] uppercase tracking-[0.5em] mb-12">Menú de la Estación</h3>
          
          <div className="w-full max-w-4xl bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden mb-12">
            <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
              <span className="font-mono text-xs text-white/40 uppercase tracking-widest">Platos en Producción</span>
              <span className="bg-kitchen-cool/20 text-kitchen-cool px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border border-kitchen-cool/20">
                Total: {chefProjects.length}
              </span>
            </div>

            <div className="divide-y divide-white/5 p-4 sm:p-8">
              {chefProjects.length === 0 ? (
                <div className="py-20 text-center opacity-20 font-mono italic">
                  Este chef no tiene platos en su estación hoy.
                </div>
              ) : (
                chefProjects.map(project => {
                  const historical = historicalProjects.find(
                    h => h.title.toLowerCase() === project.title.toLowerCase() && h.chef_id === project.chef_id
                  );
                  
                  const hasChanged = historical && (historical.status !== project.status || historical.temp !== project.temp);

                  return (
                    <div key={project.id} className="py-10 first:pt-4 last:pb-4 group">
                      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
                        {/* Info del Plato */}
                        <div className="flex-1 text-center lg:text-left">
                          <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                            <span className="text-3xl">{project.icon}</span>
                            <h4 className="text-2xl font-black italic uppercase tracking-tighter">{project.title}</h4>
                          </div>
                          <div className="flex items-center justify-center lg:justify-start gap-2">
                            <span className={`text-[10px] font-mono uppercase tracking-[0.2em] ${hasChanged ? 'text-kitchen-warm font-bold' : 'text-white/30'}`}>
                              {!historical 
                                ? '✨ Nueva Creación' 
                                : hasChanged 
                                  ? '👨‍🍳 Plato Retocado' 
                                  : '🍲 Receta Original'}
                            </span>
                            {hasChanged && (
                              <span className="flex h-2 w-2 rounded-full bg-kitchen-warm animate-ping"></span>
                            )}
                          </div>
                        </div>

                        {/* Comparativa Visual */}
                        <div className="flex items-center gap-6 sm:gap-10">
                          {historical ? (
                            <>
                              <div className="relative group/old">
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-mono text-white/20 uppercase tracking-widest whitespace-nowrap">Mise en place (Lun)</div>
                                <div className={`transition-all ${hasChanged ? 'opacity-30 scale-90 grayscale contrast-125' : 'opacity-20 scale-90 grayscale'}`}>
                                  <DishCard project={historical} canEdit={false} />
                                </div>
                              </div>
                              
                              <div className="flex flex-col items-center gap-1">
                                <div className={`text-xl transition-colors ${hasChanged ? 'text-kitchen-warm animate-pulse' : 'text-white/5'}`}>➡️</div>
                                {hasChanged && <span className="text-[8px] font-black text-kitchen-warm uppercase animate-pulse">Sabor</span>}
                              </div>

                              <div className="relative group/new">
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-mono text-kitchen-cool uppercase tracking-widest whitespace-nowrap font-bold">Al Pase (Vie)</div>
                                <div className={`transition-transform ${hasChanged ? 'scale-100 shadow-2xl group-hover/new:scale-105' : 'scale-95 opacity-80'}`}>
                                  <DishCard project={project} canEdit={false} />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="relative group/new">
                               <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-mono text-white/20 uppercase tracking-widest whitespace-nowrap">Especial del Día</div>
                               <div className="scale-105 shadow-2xl">
                                 <DishCard project={project} canEdit={false} />
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
