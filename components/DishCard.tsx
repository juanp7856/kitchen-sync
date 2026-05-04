import React, { useState } from 'react';
import EditDishModal from './EditDishModal';
import { supabase } from '@/lib/supabase';
import { Project } from '@/lib/types';

const DishCard: React.FC<{ project: Project; dragHandleProps?: any; canEdit?: boolean }> = ({ project, dragHandleProps, canEdit }) => {
  const { title, status, temp, icon, id } = project;
  const [showEdit, setShowEdit] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Seguro que quieres eliminar "${title}"?`)) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting dish:', error);
      alert('Error al eliminar el plato');
    }
    // Nota: El estado se actualizará automáticamente mediante la suscripción en tiempo real en app/page.tsx
  };

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
        onClick={() => canEdit && setShowEdit(true)}
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
          group
        `}
      >
        {canEdit && (
          <button
            onClick={handleDelete}
            onPointerDown={(e) => e.stopPropagation()} // Evita que el DND intercepte el botón
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg hover:bg-red-600 border border-white/20"
            title="Eliminar plato"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}

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
