'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface EditDishModalProps {
  project: {
    id: string;
    title: string;
    status: 'prep' | 'slow' | 'served';
    temp: number;
    icon?: string;
  };
  onClose: () => void;
}

const EditDishModal: React.FC<EditDishModalProps> = ({ project, onClose }) => {
  const [loading, setLoading] = useState(false);

  const updateProject = async (updates: any) => {
    setLoading(true);
    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', project.id);

    if (error) {
      console.error('Error updating project:', error);
    } else {
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-sm bg-kitchen-steel border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="text-4xl bg-white/5 w-16 h-16 flex items-center justify-center rounded-2xl border border-white/10">
            {project.icon || '🍳'}
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{project.title}</h2>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Ajustar Plato</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Selector de Temperatura */}
          <div className="space-y-3">
            <label className="text-[10px] font-mono uppercase opacity-50 tracking-widest">Ajustar Fuego (Urgencia)</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'CONGELADO', temp: 20, icon: '🧊', color: 'bg-kitchen-cool' },
                { label: 'SLOW COOK', temp: 60, icon: '🥘', color: 'bg-kitchen-warm' },
                { label: '¡QUEMÁNDOSE!', temp: 100, icon: '🔥', color: 'bg-kitchen-hot' }
              ].map((t) => (
                <button
                  key={t.temp}
                  disabled={loading}
                  onClick={() => updateProject({ temp: t.temp })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    project.temp === t.temp 
                      ? `${t.color} border-white shadow-lg scale-105` 
                      : 'bg-white/5 border-white/10 hover:bg-white/10 opacity-40 hover:opacity-100'
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-[8px] font-black">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] font-mono opacity-30 text-center italic mt-4">
              * Cambia el nivel de fuego según la urgencia o bloqueos
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-mono tracking-widest uppercase transition-all"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export default EditDishModal;
