'use client';

import React, { useState } from 'react';

interface AuthScreenProps {
  onEntry: (userData: { name: string; role: 'chef' | 'host'; avatar: string }) => void;
}

const AVATARS = [
  '👨‍🍳', '👩‍🍳', '🍳', '🍕', '🍔', '🌮', '🥗', '🥘'
];

const AuthScreen: React.FC<AuthScreenProps> = ({ onEntry }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'chef' | 'host'>('chef');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onEntry({ name, role, avatar });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kitchen-steel p-4">
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase mb-2">
            Kitchen<span className="text-kitchen-cool">Sync</span>
          </h1>
          <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Entra a la Cocina</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Avatar Selector */}
          <div className="flex justify-center gap-3 overflow-x-auto py-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                className={`text-3xl w-14 h-14 flex items-center justify-center rounded-2xl transition-all ${
                  avatar === a ? 'bg-kitchen-cool scale-110 shadow-lg' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <input
              autoFocus
              type="text"
              placeholder="¿Cómo te llamas, Chef?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:border-kitchen-cool transition-colors text-center"
              required
            />

            <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={() => setRole('chef')}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${
                  role === 'chef' ? 'bg-kitchen-cool text-white shadow-lg' : 'text-white/40'
                }`}
              >
                CHEF
              </button>
              <button
                type="button"
                onClick={() => setRole('host')}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${
                  role === 'host' ? 'bg-kitchen-hot text-white shadow-lg' : 'text-white/40'
                }`}
              >
                EL MAÎTRE
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black font-black py-5 rounded-3xl text-xl hover:bg-kitchen-done hover:text-white transition-all transform active:scale-95 shadow-xl"
          >
            ¡OÍDO COCINA!
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthScreen;
