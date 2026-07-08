'use client';

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AvatarDisplay from '../AvatarDisplay';

interface AuthScreenProps {
  onEntry: (userData: { name: string; avatar: string; email: string; profileId: string }) => void;
}

const AVATARS = [
  '👨‍🍳', '👩‍🍳', '🍳', '🍕', '🍔', '🌮', '🥗', '🥘'
];

const AuthScreen: React.FC<AuthScreenProps> = ({ onEntry }) => {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [uploading, setUploading] = useState(false);
  const [email, setEmail] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // File upload is not needed for this simplified auth flow
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setUploading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data: insertData, error: insertError } = await supabase
        .from('profiles')
        .insert([{
          email: normalizedEmail,
          name: name.trim(),
          avatar,
        }])
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          // UNIQUE race condition — another concurrent registration won
          // Retry SELECT to get the existing profile
          const { data: retryData, error: retryError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', normalizedEmail)
            .single();

          if (retryError || !retryData) {
            alert('Error al registrarte. Intenta de nuevo.');
            setUploading(false);
            return;
          }

          onEntry({
            name: retryData.name,
            avatar: retryData.avatar || AVATARS[0],
            email: normalizedEmail,
            profileId: retryData.id,
          });
        } else {
          console.error('Error inserting profile:', insertError);
          alert('Error al registrarte. Intenta de nuevo.');
          setUploading(false);
          return;
        }
      } else {
        onEntry({
          name: name.trim(),
          avatar,
          email: normalizedEmail,
          profileId: insertData.id,
        });
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      alert('Error inesperado. Intenta de nuevo.');
    }
    setUploading(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    const normalizedEmail = email.trim().toLowerCase();

    // Query profiles table by normalized email
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', normalizedEmail);

    if (error) {
      console.error('Error looking up profile:', error);
      // Continue to profile step on error
      setStep('profile');
      return;
    }

    if (data && data.length > 0) {
      // Returning user — profile found, enter directly
      const profile = data[0];
      onEntry({
        name: profile.name,
        avatar: profile.avatar || AVATARS[0],
        email: normalizedEmail,
        profileId: profile.id,
      });
    } else {
      // New user — go to profile step
      setStep('profile');
    }
  };

  const [step, setStep] = useState<'auth' | 'profile'>('auth');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kitchen-steel p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase mb-2">
            Kitchen<span className="text-kitchen-cool">Sync</span>
          </h1>
          <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Identifícate para entrar</p>
        </div>

        {step === 'auth' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-mono uppercase opacity-50 ml-1 tracking-widest">Email</label>
              <input
                autoFocus
                type="email"
                placeholder="chef@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:border-kitchen-cool transition-colors text-center"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-white text-black font-black py-5 rounded-3xl text-xl hover:bg-kitchen-cool hover:text-white transition-all transform active:scale-95 shadow-xl"
            >
              CONTINUAR
            </button>
            <p className="text-center text-[9px] font-mono text-white/20 uppercase tracking-tighter">
              Sin contraseñas. Sin fricción. Solo cocina.
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Selector */}
            <div className="flex justify-start sm:justify-center items-center gap-3 overflow-x-auto py-2 no-scrollbar">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={`text-2xl sm:text-3xl min-w-[3rem] sm:min-w-[3.5rem] h-12 sm:h-14 flex items-center justify-center rounded-2xl transition-all ${
                    avatar === a ? 'bg-kitchen-cool scale-110 shadow-lg' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-2xl sm:text-3xl min-w-[3rem] sm:min-w-[3.5rem] h-12 sm:h-14 flex items-center justify-center rounded-2xl transition-all border-2 border-dashed border-white/10 bg-white/5 hover:bg-white/10"
              >
                📷
              </button>
            </div>

            <div className="space-y-4">
              <input
                autoFocus
                type="text"
                placeholder="¿Cómo te llamas, Chef?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-lg sm:text-xl font-bold focus:outline-none focus:border-kitchen-cool transition-colors text-center"
                required
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-white text-black font-black py-4 sm:py-5 rounded-2xl sm:rounded-3xl text-lg sm:text-xl hover:bg-kitchen-cool hover:text-white transition-all transform active:scale-95 shadow-xl disabled:opacity-50"
            >
              {uploading ? '...' : '¡OÍDO COCINA!'}
            </button>

            <button
              type="button"
              onClick={() => setStep('auth')}
              className="w-full text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              ← Cambiar email
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
