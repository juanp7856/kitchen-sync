'use client';

import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import DishCard from './DishCard';

interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served';
  temp: number;
  chef_id: string;
}

interface MasterKitchenViewProps {
  projects: Project[];
}

const MasterKitchenView: React.FC<MasterKitchenViewProps> = ({ projects }) => {
  // Agrupar proyectos por chef_id
  const chefs = Array.from(new Set(projects.map((p) => p.chef_id)));

  return (
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
            {chefs.map((chefId) => (
              <div key={chefId} className="flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                  <div className="w-10 h-10 bg-kitchen-cool rounded-full flex items-center justify-center font-bold shadow-lg">
                    {chefId.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-black uppercase tracking-widest text-sm">Estación</h2>
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
            ))}

            {chefs.length === 0 && (
              <div className="flex items-center justify-center w-full h-full text-white/20 font-mono italic">
                Esperando a que los chefs preparen sus estaciones...
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
};

export default MasterKitchenView;
