'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface KitchenTimerProps {
  isHost: boolean;
}

const KitchenTimer: React.FC<KitchenTimerProps> = ({ isHost }) => {
  const [seconds, setSeconds] = useState(60);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Suscribirse a los eventos del timer
    const channel = supabase.channel('room-timer');
    
    channel
      .on('broadcast', { event: 'timer-update' }, ({ payload }) => {
        if (!isHost) {
          setSeconds(payload.seconds);
          setIsActive(payload.isActive);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHost]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => {
          const next = prev - 1;
          
          if (next <= 0) {
            setIsActive(false);
            if (isHost) {
              playBell();
              // Emitir el estado final de 0
              supabase.channel('room-timer').send({
                type: 'broadcast',
                event: 'timer-update',
                payload: { seconds: 0, isActive: false },
              });
            }
            return 0;
          }

          // El host emite el estado actual para sincronizar
          if (isHost && next % 2 === 0) { // Emitir cada 2 segundos para ahorrar ancho de banda
            supabase.channel('room-timer').send({
              type: 'broadcast',
              event: 'timer-update',
              payload: { seconds: next, isActive: true },
            });
          }
          return next;
        });
      }, 1000);
    } else if (seconds <= 0 && isActive) {
      setIsActive(false);
      if (isHost) playBell();
    }

    return () => clearInterval(interval);
  }, [isActive, seconds, isHost]);

  const playBell = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  const toggleTimer = () => {
    if (!isHost) return;
    const newState = !isActive;
    setIsActive(newState);
    
    supabase.channel('room-timer').send({
      type: 'broadcast',
      event: 'timer-update',
      payload: { seconds, isActive: newState },
    });
  };

  const resetTimer = () => {
    if (!isHost) return;
    setSeconds(60);
    setIsActive(false);
    
    supabase.channel('room-timer').send({
      type: 'broadcast',
      event: 'timer-update',
      payload: { seconds: 60, isActive: false },
    });
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 bg-black/40 px-6 py-3 rounded-full border border-white/10 shadow-inner">
      <div className={`font-mono text-3xl font-black ${seconds < 30 ? 'text-kitchen-hot animate-pulse' : 'text-white'}`}>
        {formatTime(seconds)}
      </div>
      {isHost && (
        <div className="flex gap-2 animate-in fade-in duration-500">
          <button
            onClick={toggleTimer}
            className={`p-2 rounded-full transition-colors ${isActive ? 'bg-kitchen-hot hover:bg-red-600' : 'bg-kitchen-cool hover:bg-blue-600'}`}
          >
            {isActive ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
          <button
            onClick={resetTimer}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default KitchenTimer;
