'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DishCard from './DishCard';

interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served';
  temp: number;
  chef_id: string;
  icon?: string;
  sort_order: number;
}

interface RoundState {
  isActive: boolean;
  currentChefIndex: number;
  order: string[];
  chefData: Record<string, { name: string; avatar: string }>;
  timeLeft: number;
}

interface EvaluationRoundsProps {
  isHost: boolean;
  projects: Project[];
  currentUser: { name: string; avatar: string };
}

const EvaluationRounds: React.FC<EvaluationRoundsProps> = ({ isHost, projects, currentUser }) => {
  const [round, setRound] = useState<RoundState | null>(null);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const channel = supabase.channel('room-state');

    channel
      .on('broadcast', { event: 'round-update' }, ({ payload }) => {
        setRound(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
          
          if (isHost && nextTime % 5 === 0) {
            broadcastUpdate({ ...prev, timeLeft: nextTime });
          }
          
          return { ...prev, timeLeft: nextTime };
        });
      }, 1000);
    } else if (round?.timeLeft === 0 && round?.isActive) {
      if (isHost) playBell();
    }
    return () => clearInterval(interval);
  }, [round?.isActive, round?.currentChefIndex, isHost]);

  const playBell = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  const broadcastUpdate = (newState: RoundState | null) => {
    supabase.channel('room-state').send({
      type: 'broadcast',
      event: 'round-update',
      payload: newState,
    });
  };

  const startRounds = () => {
    const chefsWithProjects = Array.from(new Set(projects.map(p => p.chef_id)));
    const shuffledChefs = [...chefsWithProjects].sort(() => Math.random() - 0.5);
    
    // En un sistema real, sacaríamos avatar de una tabla de presencia/users
    // Aquí usaremos datos básicos
    const chefData: Record<string, { name: string; avatar: string }> = {};
    shuffledChefs.forEach(id => {
      chefData[id] = { name: id, avatar: '👨‍🍳' };
    });

    const initialState: RoundState = {
      isActive: true,
      currentChefIndex: 0,
      order: shuffledChefs,
      chefData,
      timeLeft: 90,
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
      const newState = {
        ...round,
        currentChefIndex: nextIndex,
        timeLeft: 90,
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
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col">
        <header className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            <div className="text-6xl bg-white/5 w-24 h-24 flex items-center justify-center rounded-3xl border-2 border-white/10 shadow-inner">
              {chefInfo?.avatar || '👨‍🍳'}
            </div>
            <div>
              <span className="text-kitchen-hot font-mono text-sm tracking-[0.3em] uppercase mb-2 block">Presentando Estación</span>
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
          <h3 className="text-white/40 font-mono text-xs uppercase tracking-[0.5em] mb-8 text-center">Especialidades del Chef</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {chefProjects.map(project => (
              <div key={project.id} className="transform scale-110">
                <DishCard project={project} canEdit={false} />
              </div>
            ))}
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
