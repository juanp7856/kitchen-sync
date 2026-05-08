'use client';

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AvatarDisplay from '../AvatarDisplay';

interface AuthScreenProps {
  onEntry: (userData: { name: string; role: 'chef' | 'host'; avatar: string; email: string }) => void;
}

const AVATARS = [
  '👨‍🍳', '👩‍🍳', '🍳', '🍕', '🍔', '🌮', '🥗', '🥘'
];

const AuthScreen: React.FC<AuthScreenProps> = ({ onEntry }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'chef' | 'host'>('chef');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatar(publicUrl);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Error al subir la imagen. Asegúrate de que el bucket "avatars" sea público.');
    } finally {
      setUploading(false);
    }
  };

  const [step, setStep] = useState<'auth' | 'profile'>('auth');
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMaîtreLogin, setShowMaîtreLogin] = useState(false);
  const [hostCode, setHostCode] = useState('');
  const HOST_SECRET = 'CHEF123';

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user?.email) {
        const userEmail = session.user.email;
        setEmail(userEmail);
        
        // Intentar recuperar perfil del localStorage
        const savedProfiles = JSON.parse(localStorage.getItem('kitchen-sync-profiles') || '{}');
        const userProfile = savedProfiles[userEmail];

        if (userProfile) {
          setName(userProfile.name || '');
          setAvatar(userProfile.avatar || AVATARS[0]);
          setRole(userProfile.role || 'chef');
          
          // Si ya tenemos todo el perfil, entrar directo
          onEntry({ 
            name: userProfile.name, 
            role: userProfile.role, 
            avatar: userProfile.avatar, 
            email: userEmail 
          });
        } else {
          // Si no hay perfil pero sí sesión, vamos al paso de perfil
          setStep('profile');
          // Autodetectar Host por email
          if (userEmail === 'jduarte@intercorp.com.pe') {
            setRole('host');
            setShowMaîtreLogin(true);
          }
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        const userEmail = session.user.email;
        setEmail(userEmail);
        setStep('profile');

        // Autodetectar Host
        if (userEmail === 'jduarte@intercorp.com.pe') {
          setRole('host');
          setShowMaîtreLogin(true);
        }

        // Si ya hay perfil, entrar
        const savedProfiles = JSON.parse(localStorage.getItem('kitchen-sync-profiles') || '{}');
        const userProfile = savedProfiles[userEmail];
        if (userProfile) {
          onEntry({ 
            name: userProfile.name, 
            role: userProfile.role, 
            avatar: userProfile.avatar, 
            email: userEmail 
          });
        }
      }
      if (event === 'SIGNED_OUT') {
        setStep('auth');
        setEmail('');
        setName('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || loading) return;

    // EL HOST SIEMPRE USA MAGIC LINK PARA SEGURIDAD
    if (trimmedEmail === 'jduarte@intercorp.com.pe') {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        alert(`Error: ${error.message}`);
      } else {
        setMagicLinkSent(true);
      }
      setLoading(false);
    } else {
      // LOS CHEFS ENTRAN DIRECTO (Bypass rate limit de Supabase)
      setEmail(trimmedEmail);
      setStep('profile');
      setRole('chef');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || uploading) return;

    if (role === 'host' && hostCode !== HOST_SECRET) {
      alert('Código de Maître incorrecto ❌');
      return;
    }

    // Guardar perfil en localStorage para futuras sesiones
    const savedProfiles = JSON.parse(localStorage.getItem('kitchen-sync-profiles') || '{}');
    savedProfiles[email] = { name, role, avatar };
    localStorage.setItem('kitchen-sync-profiles', JSON.stringify(savedProfiles));

    onEntry({ name, role, avatar, email });
  };

  if (magicLinkSent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-kitchen-steel p-4">
        <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-12 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="text-6xl animate-bounce">📧</div>
          <h2 className="text-3xl font-black italic uppercase text-kitchen-cool">¡Revisa tu correo!</h2>
          <p className="text-white/60 font-mono text-sm leading-relaxed">
            Hemos enviado un enlace mágico a <span className="text-white font-bold">{email}</span>.<br/>
            Haz clic en el enlace para entrar a la cocina.
          </p>
          <button 
            onClick={() => setMagicLinkSent(false)}
            className="text-[10px] font-mono uppercase tracking-widest text-white/20 hover:text-white transition-colors"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-kitchen-steel p-4 overflow-y-auto">
        <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black tracking-tighter italic uppercase mb-2">
              Kitchen<span className="text-kitchen-cool">Sync</span>
            </h1>
            <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Identifícate para entrar</p>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-mono uppercase opacity-50 ml-1 tracking-widest">Email de Chef</label>
              <input
                autoFocus
                type="email"
                placeholder="chef@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:border-kitchen-cool transition-colors text-center"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-black py-5 rounded-3xl text-xl hover:bg-kitchen-cool hover:text-white transition-all transform active:scale-95 shadow-xl disabled:opacity-50"
            >
              {loading ? 'CARGANDO...' : (email.trim().toLowerCase() === 'jduarte@intercorp.com.pe' ? 'ENVIAR ENLACE MÁGICO' : 'ENTRAR A LA COCINA')}
            </button>
            <p className="text-center text-[9px] font-mono text-white/20 uppercase tracking-tighter">
              {email.trim().toLowerCase() === 'jduarte@intercorp.com.pe' ? 'Seguridad activada para el Maître.' : 'Sin contraseñas. Sin fricción. Solo cocina.'}
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-kitchen-steel p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in duration-300 my-auto">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter italic uppercase mb-2">
            Kitchen<span className="text-kitchen-cool">Sync</span>
          </h1>
          <p className="text-white/40 font-mono text-xs sm:text-sm uppercase tracking-widest">Configura tu Estación</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
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
              className={`text-2xl sm:text-3xl min-w-[3rem] sm:min-w-[3.5rem] h-12 sm:h-14 flex items-center justify-center rounded-2xl transition-all border-2 border-dashed ${
                avatar.startsWith('http') ? 'border-kitchen-cool bg-kitchen-cool/10 scale-110 shadow-lg' : 'border-white/10 bg-white/5 hover:bg-white/10'
              } ${uploading ? 'animate-pulse' : ''}`}
            >
              {uploading ? '⏳' : avatar.startsWith('http') ? (
                <AvatarDisplay avatar={avatar} className="w-8 h-8 sm:w-10 sm:h-10" />
              ) : '📷'}
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

            {showMaîtreLogin ? (
              <div className="space-y-4 animate-in slide-in-from-top duration-300">
                <input
                  type="password"
                  placeholder="Código Secreto de Maître"
                  value={hostCode}
                  onChange={(e) => setHostCode(e.target.value)}
                  className="w-full bg-kitchen-hot/10 border-2 border-kitchen-hot/20 rounded-2xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-kitchen-hot transition-colors text-center text-kitchen-hot placeholder:text-kitchen-hot/40"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowMaîtreLogin(false);
                    setRole('chef');
                  }}
                  className="w-full text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  ← Volver a modo Chef
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-full py-3 bg-kitchen-cool/20 border border-kitchen-cool/30 rounded-2xl text-center">
                  <span className="font-black text-sm text-kitchen-cool uppercase tracking-widest">Rol: Chef de Partie</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMaîtreLogin(true);
                    setRole('host');
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-white/20 hover:text-white transition-colors"
                >
                  ¿Eres el Maître? Acceso Secreto
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className={`w-full ${role === 'host' ? 'bg-kitchen-hot' : 'bg-white'} ${role === 'host' ? 'text-white' : 'text-black'} font-black py-4 sm:py-5 rounded-2xl sm:rounded-3xl text-lg sm:text-xl hover:bg-kitchen-done hover:text-white transition-all transform active:scale-95 shadow-xl`}
          >
            {role === 'host' ? '¡TOMAR EL MANDO!' : '¡OÍDO COCINA!'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthScreen;
