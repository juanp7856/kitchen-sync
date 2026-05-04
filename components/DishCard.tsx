import React, { useState } from 'react';
import EditDishModal from './EditDishModal';

import { Project } from '@/lib/types';

const DishCard: React.FC<{ project: Project; dragHandleProps?: any; canEdit?: boolean }> = ({ project, dragHandleProps, canEdit }) => {
  const { title, status, temp, icon } = project;
  const [showEdit, setShowEdit] = useState(false);

  const getBackgroundColor = () => {
    if (status === 'served') return 'bg-kitchen-done';
    if (temp >= 100) return 'bg-kitchen-hot';
    if (temp >= 60) return 'bg-kitchen-warm'; // Color para Slow Cook / Stopper
    return 'bg-kitchen-cool';
  };

  const getTempIcon = () => {
    if (temp >= 100) return '🔥';
    if (temp >= 60) return '🥘'; // Metáfora de "A fuego lento" o "Plato pesado"
    return '🧊';
  };

  const isCritical = temp >= 100 && status !== 'served';

  return (
    <>
      <div
        {...dragHandleProps}
        onPointerDown={(e) => {
          // Prevenir que el DnD bloquee el click si es un toque rápido
          if (canEdit) {
            const timer = setTimeout(() => {}, 200);
            e.currentTarget.onpointerup = () => {
              clearTimeout(timer);
              setShowEdit(true);
            };
          }
        }}
        className={`
          ${getBackgroundColor()}
          ${isCritical ? 'animate-kitchen-pulse border-4' : 'border-2'}
          border-white/20
          rounded-xl
          p-4
          shadow-lg
          transition-all
          duration-300
          ${canEdit ? 'hover:scale-105 cursor-pointer active:scale-95' : 'cursor-default'}
          min-w-[200px]
          relative
          select-none
        `}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl bg-white/10 w-10 h-10 flex items-center justify-center rounded-lg border border-white/5">
            {icon || '🍳'}
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] font-mono uppercase opacity-70">
                {status}
              </span>
              <span className="text-xs" title={`Temp: ${temp}°C`}>
                {getTempIcon()}
              </span>
            </div>
            <h3 className="text-md font-bold leading-tight">
              {title}
            </h3>
          </div>
        </div>
        
        {isCritical && (
          <div className="mt-3 text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded text-center">
            ¡RESCATE!
          </div>
        )}
      </div>

      {showEdit && (
        <EditDishModal 
          project={project} 
          onClose={() => setShowEdit(false)} 
        />
      )}
    </>
  );
};

export default DishCard;
