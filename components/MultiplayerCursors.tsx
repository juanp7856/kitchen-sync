'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Cursor {
  id: string;
  name: string;
  avatar: string;
  x: number;
  y: number;
}

const MultiplayerCursors: React.FC<{ userName: string; userAvatar: string }> = ({ userName, userAvatar }) => {
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});

  useEffect(() => {
    const channel = supabase.channel('online-chefs', {
      config: {
        presence: {
          key: userName,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const formattedCursors: Record<string, Cursor> = {};
        
        Object.keys(state).forEach((key) => {
          if (key !== userName) {
            const presences = state[key] as any[];
            if (presences && presences.length > 0) {
              const presence = presences[0];
              // Asegurar que solo mostramos si tiene coordenadas válidas
              if (presence.x !== undefined && presence.y !== undefined) {
                formattedCursors[key] = {
                  id: key,
                  name: key, // El nombre es la key
                  avatar: presence.avatar || '👤',
                  x: presence.x,
                  y: presence.y,
                };
              }
            }
          }
        });
        setCursors(formattedCursors);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('KitchenSync: Presencia activa para', userName);
          await channel.track({
            name: userName,
            avatar: userAvatar,
            x: 0,
            y: 0,
          });
        }
      });

    let lastUpdate = 0;
    const throttleMs = 50; // Más frecuencia para mayor fluidez (50ms)

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;

      // Usar coordenadas de viewport (0-100) para que sea consistente entre resoluciones
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      
      channel.track({
        name: userName,
        avatar: userAvatar,
        x,
        y,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      supabase.removeChannel(channel);
    };
  }, [userName, userAvatar]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {Object.values(cursors).map((cursor) => (
        <div
          key={cursor.id}
          className="absolute transition-all duration-150 ease-out flex flex-col items-center"
          style={{
            left: `${cursor.x}%`,
            top: `${cursor.y}%`,
          }}
        >
          <div className="relative">
             {/* Icono de Cursor Estilo Miro */}
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z" fill="#3B82F6" stroke="white"/>
             </svg>
             <div className="absolute left-4 top-4 bg-kitchen-cool border border-white/20 px-2 py-1 rounded-full flex items-center gap-2 whitespace-nowrap shadow-2xl">
               <span className="text-xs">{cursor.avatar}</span>
               <span className="text-[9px] font-black uppercase tracking-tighter text-white">{cursor.name}</span>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MultiplayerCursors;
