'use client';

import React, { useEffect, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import DishCard from './DishCard';
import AvatarDisplay from './AvatarDisplay';
import { supabase } from '@/lib/supabase';
import { Project } from '@/lib/types';

interface MasterKitchenViewProps {
  projects: Project[];
  chefAvatars: Record<string, { avatar: string; isReady: boolean }>;
}

const MasterKitchenView: React.FC<MasterKitchenViewProps> = ({ projects, chefAvatars }) => {
  // Agrupar proyectos por chef_id
  const chefs = Array.from(new Set(projects.map((p) => p.chef_id)));

  // Contar chefs listos
  const readyChefsCount = Object.values(chefAvatars).filter(c => c.isReady).length;
  const totalChefsCount = Object.keys(chefAvatars).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
        <div className="flex -space-x-2">
          {Object.entries(chefAvatars).map(([name, data]) => (
            <div 
              key={name} 
              className={`w-8 h-8 rounded-full border-2 ${data.isReady ? 'border-kitchen-done animate-pulse' : 'border-white/10'} bg-kitchen-steel flex items-center justify-center overflow-hidden`}
              title={`${name}: ${data.isReady ? 'LISTO' : 'Cocinando...'}`}
            >
              <AvatarDisplay avatar={data.avatar} className="w-6 h-6 text-sm" />
            </div>
          ))}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-white/60">
          Chefs Listos: <span className="text-kitchen-done font-bold">{readyChefsCount}</span> / {totalChefsCount}
        </div>
      </div>

      <div 
        className="w-full h-[600px] bg-black/20 rounded-3xl border border-white/5 overflow-hidden host-view shadow-inner relative"
      >
        <TransformWrapper
          initialScale={1}
          minScale={0.4}
          maxScale={2}
          centerOnInit
          smooth={true}
          limitToBounds={false}
          wheel={{ step: 0.05 }} // Zoom MUCHO más suave
          zoomAnimation={{ disabled: false, size: 0.1, animationTime: 400 }}
        >
          <TransformComponent wrapperClass="!w-full !h-full">
            <div 
              className="flex gap-20 p-20 min-w-[2500px]"
            >
              {chefs.map((chefId) => {
                const isChefReady = chefAvatars[chefId]?.isReady;
                
                return (
                  <div key={chefId} className="flex flex-col gap-6">
                    <div className={`flex items-center gap-3 border-b pb-4 transition-colors ${isChefReady ? 'border-kitchen-done' : 'border-white/20'}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg overflow-hidden border-2 ${isChefReady ? 'border-kitchen-done bg-kitchen-done/20' : 'border-kitchen-cool bg-kitchen-cool'}`}>
                        <AvatarDisplay avatar={chefAvatars[chefId]?.avatar || chefId.charAt(0).toUpperCase()} className="w-8 h-8 text-xl" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="font-black uppercase tracking-widest text-sm">Estación</h2>
                          {isChefReady && (
                            <span className="text-[10px] bg-kitchen-done text-white px-2 py-0.5 rounded-full font-black animate-bounce">READY</span>
                          )}
                        </div>
                        <p className="font-mono text-xs opacity-50">{chefId}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {projects
                        .filter((p) => p.chef_id === chefId)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((project) => (
                          <DishCard 
                            key={project.id} 
                            project={project} 
                            canEdit={false} // El Host NO puede editar
                          />
                        ))}
                    </div>
                  </div>
                );
              })}

              {chefs.length === 0 && (
                <div className="flex items-center justify-center w-full h-full text-white/20 font-mono italic">
                  Esperando a que los chefs preparen sus estaciones...
                </div>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
};

export default MasterKitchenView;
