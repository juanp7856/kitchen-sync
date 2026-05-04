'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AvatarDisplay from './AvatarDisplay';

interface Cursor {
  id: string;
  name: string;
  avatar: string;
  x: number;
  y: number;
}

interface MultiplayerCursorsProps {
  userName: string;
  userAvatar: string;
  isReady: boolean;
  cursors: Record<string, Cursor>;
  channel: any;
}

const MultiplayerCursors: React.FC<MultiplayerCursorsProps> = ({ userName, userAvatar, isReady, cursors, channel }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!channel) return;

    const trackState = (x: number, y: number) => {
      channel.track({
        name: userName,
        avatar: userAvatar,
        isReady: isReady,
        x,
        y,
      });
    };

    let lastUpdate = 0;
    const throttleMs = 50; 

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setMousePos({ x, y });

      const now = Date.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;

      trackState(x, y);
    };

    window.addEventListener('mousemove', handleMouseMove);

    // También trackear cuando cambia isReady, incluso si el ratón no se mueve
    trackState(mousePos.x, mousePos.y);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [userName, userAvatar, isReady, channel]);

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
               <AvatarDisplay avatar={cursor.avatar} className="w-4 h-4 text-xs" />
               <span className="text-[9px] font-black uppercase tracking-tighter text-white">{cursor.name}</span>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MultiplayerCursors;
