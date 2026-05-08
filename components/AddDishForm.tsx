'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AddDishFormProps {
  chefId: string;
  sessionId: string;
}

const AVATARS = ['🍳', '🍕', '🍔', '🌮', '🥗', '🥘', '🍜', '🍰', '☕', '🥤'];

const AddDishForm: React.FC<AddDishFormProps> = ({ chefId, sessionId }) => {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    const { error } = await supabase
      .from('projects')
      .insert([
        { 
          title, 
          status: 'prep', 
          temp: 20, 
          chef_id: chefId,
          icon,
          sort_order: Date.now(),
          session_id: sessionId
        }
      ]);

    if (error) {
      console.error('Error adding dish:', error);
      alert('Error al añadir el plato. Revisa tu consola y asegúrate de tener las tablas creadas en Supabase.');
    } else {
      setTitle('');
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 md:mb-8 space-y-4 bg-white/5 p-4 md:p-6 rounded-2xl border border-white/10">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="flex flex-row sm:flex-col gap-2 items-center sm:items-start">
          <label className="text-[10px] font-mono uppercase opacity-50 sm:ml-1">Icono</label>
          <select 
            value={icon} 
            onChange={(e) => setIcon(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg p-2 text-xl focus:outline-none focus:ring-1 focus:ring-kitchen-cool flex-1 sm:flex-none"
          >
            {AVATARS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <label className="text-[10px] font-mono uppercase opacity-50 sm:ml-1">Nombre del Plato</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Base de datos, Frontend..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-kitchen-cool"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-kitchen-cool hover:bg-blue-600 px-8 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 h-[42px] w-full sm:w-auto mt-2 sm:mt-0"
        >
          {loading ? '...' : 'AÑADIR'}
        </button>
      </div>
    </form>
  );
};

export default AddDishForm;
