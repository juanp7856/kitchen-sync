'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DishCard from '@/components/DishCard';
import AddDishForm from '@/components/AddDishForm';
import KitchenTimer from '@/components/KitchenTimer';
import MasterKitchenView from '@/components/MasterKitchenView';
import AuthScreen from '@/components/auth/AuthScreen';
import EvaluationRounds from '@/components/EvaluationRounds';
import HostTransferModal from '@/components/host/HostTransferModal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import AvatarDisplay from '@/components/AvatarDisplay';
import { Project, KitchenSession } from '@/lib/types';
import { cloneSession } from '@/lib/sessions';
import { useHostManager } from '@/hooks/useHostManager';
import TopicHeatmap from '@/components/host/TopicHeatmap';

export const dynamic = 'force-dynamic';

interface UserSession {
  name: string;
  avatar: string;
  email: string;
  profileId: string;
}

export default function KitchenPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [chefAvatars, setChefAvatars] = useState<Record<string, { avatar: string; isReady: boolean }>>({});
  const [presenceChannel, setPresenceChannel] = useState<any>(null);
  const [currentSession, setCurrentSession] = useState<KitchenSession | null>(null);

  const [historicalProjects, setHistoricalProjects] = useState<Project[]>([]);
  const [showHostTransferModal, setShowHostTransferModal] = useState(false);

  // Host management via database singleton
  const { isHost, transferHost } = useHostManager();

  // Carga de proyectos por sesión
  const fetchProjects = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*, profiles(name, avatar)')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setProjects(data || []);
      
      // Buscar históricos por NOMBRE y CHEF (ya que no hay parent_id en la BD)
      // Buscamos en la sesión inmediata anterior del tipo opuesto
      const { data: currentSess } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      if (currentSess) {
        const prevType = currentSess.type === 'friday' ? 'monday' : 'friday';
        const { data: prevSess } = await supabase
          .from('sessions')
          .select('id')
          .eq('type', prevType)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (prevSess) {
          const { data: historical } = await supabase
            .from('projects')
            .select('*, profiles(name, avatar)')
            .eq('session_id', prevSess.id);
          setHistoricalProjects(historical || []);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    // 0. Recuperar sesión
    const savedSession = localStorage.getItem('kitchen-sync-session');
    const parsedSession = savedSession ? JSON.parse(savedSession) : null;
    if (parsedSession) {
      setSession(parsedSession);
    }
    setIsSessionLoaded(true);

    // 1. Cargar Sesión Activa
    const fetchActiveSession = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setCurrentSession(data);
        fetchProjects(data.id);
      } else {
        setLoading(false);
      }
    };

    fetchActiveSession();

    // Suscribirse a cambios en sesiones
    const sessionsChannel = supabase
      .channel('public:sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const s = payload.new as KitchenSession;
          if (s.status === 'active') {
            setCurrentSession(s);
            fetchProjects(s.id);
          } else if (currentSession?.id === s.id) {
            setCurrentSession(null);
            setProjects([]);
          }
        }
      })
      .subscribe();

    // 2. Suscripción de Proyectos (SINCRONIZACIÓN REAL-TIME)
    const projectsChannel = supabase
      .channel('public:projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newProject = payload.new as Project;
          // Validar que pertenezca a la sesión actual
          if (currentSession && newProject.session_id !== currentSession.id) return;

          setProjects((current) => {
            if (current.find(p => p.id === newProject.id)) return current;
            return [...current, newProject].sort((a, b) => a.sort_order - b.sort_order);
          });
        } 
        else if (payload.eventType === 'UPDATE') {
          const updatedProject = payload.new as Project;
          if (currentSession && updatedProject.session_id !== currentSession.id) return;

          setProjects((current) => 
            current.map(p => p.id === updatedProject.id ? updatedProject : p)
                   .sort((a, b) => a.sort_order - b.sort_order)
          );
        } 
        else if (payload.eventType === 'DELETE') {
          // IMPORTANTE: En DELETE, payload.new es null y payload.old solo contiene el ID
          const deletedId = payload.old.id;
          setProjects((current) => current.filter(p => p.id !== deletedId));
        }
      })
      .subscribe();

    // 3. Suscripción de Señales Globales (Borrado Masivo, etc)
    const signalChannel = supabase
      .channel('kitchen-signals')
      .on('broadcast', { event: 'kitchen-cleared' }, () => {
        setProjects([]);
      })
      .subscribe();

    // 3. Suscripción de Presencia (SIN CURSORES)
    const pChannel = supabase.channel('online-chefs', {
      config: {
        presence: {
          key: parsedSession?.name || 'anonymous',
        },
      },
    });

    pChannel
      .on('presence', { event: 'sync' }, () => {
        const state = pChannel.presenceState();
        const avatars: Record<string, { avatar: string; isReady: boolean }> = {};
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as any[];
          if (presences && presences.length > 0) {
            const presence = presences[presences.length - 1];
            if (presence.avatar) {
              avatars[key] = { 
                avatar: presence.avatar, 
                isReady: !!presence.isReady 
              };
            }
          }
        });
        
        setChefAvatars({ ...avatars });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && parsedSession) {
          await pChannel.track({
            name: parsedSession.name,
            avatar: parsedSession.avatar,
            isReady: false
          });
        }
      });

    setPresenceChannel(pChannel);

    return () => {
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(pChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, [currentSession?.id]);

  const [suggestedSession, setSuggestedSession] = useState<'monday' | 'friday'>('monday');

  useEffect(() => {
    // Sugerir tipo de sesión según el día
    const day = new Date().getDay();
    if (day >= 4 || day === 0) { // Jueves a Domingo sugerimos Viernes
      setSuggestedSession('friday');
    } else {
      setSuggestedSession('monday');
    }
  }, []);

  // Sincronizar estado de "LISTO" con presencia
  useEffect(() => {
    if (presenceChannel && session) {
      presenceChannel.track({
        name: session.name,
        avatar: session.avatar,
        isReady: isReady
      });
    }
  }, [isReady, presenceChannel, session]);

  const handleCreateSession = async (type: 'monday' | 'friday') => {
    setLoading(true);
    
    // 1. Cerrar sesiones anteriores
    await supabase
      .from('sessions')
      .update({ status: 'closed' })
      .eq('status', 'active');

    // 2. Crear nueva sesión
    const newSession = await cloneSession(type);

    if (newSession) {
      setCurrentSession(newSession);
      fetchProjects(newSession.id);
    } else {
      alert('Error al crear la sesión');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!session) return;
    const signalChannel = supabase.channel('chef-signals');
    signalChannel
      .on('broadcast', { event: 'chef-ready' }, () => {
        if (isHost(session.email)) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3');
          audio.play().catch(e => console.log('Audio error:', e));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(signalChannel);
    };
  }, [session, isHost]);

  const handleEntry = (userData: UserSession) => {
    setSession(userData);
    localStorage.setItem('kitchen-sync-session', JSON.stringify(userData));
  };

  const handleCloseSession = async () => {
    if (!currentSession) return;
    if (!window.confirm('🚨 ¿CERRAR COCINA? Esto archivará la sesión actual y todos los chefs volverán a la sala de espera.')) return;

    setLoading(true);
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'closed' })
      .eq('id', currentSession.id);

    if (error) {
      alert('Error al cerrar la sesión');
    } else {
      setCurrentSession(null);
      setProjects([]);
    }
    setLoading(false);
  };

  const handleClearKitchen = async () => {
    if (!window.confirm('🚨 ¿ESTÁS SEGURO? Esto eliminará TODOS los platos de la sesión actual.')) return;
    
    // 1. Borrar de la DB
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('session_id', currentSession?.id);

    if (error) {
      alert('Error al limpiar la cocina');
    } else {
      // 2. Notificar a todos por broadcast para limpieza instantánea
      supabase.channel('kitchen-signals').send({
        type: 'broadcast',
        event: 'kitchen-cleared',
        payload: {}
      });
      // 3. Limpiar estado local propio
      setProjects([]);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('kitchen-sync-session');
    setSession(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = projects.findIndex((p) => p.id === active.id);
      const newIndex = projects.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(projects, oldIndex, newIndex);
      setProjects(newOrder);

      const movedItem = newOrder[newIndex];
      const prevItem = newOrder[newIndex - 1];
      const nextItem = newOrder[newIndex + 1];

      let finalSortOrder = 0;
      if (!prevItem) finalSortOrder = nextItem.sort_order - 1000;
      else if (!nextItem) finalSortOrder = prevItem.sort_order + 1000;
      else finalSortOrder = (prevItem.sort_order + nextItem.sort_order) / 2;

      await supabase
        .from('projects')
        .update({ sort_order: finalSortOrder })
        .eq('id', movedItem.id);
    }
  };

  if (!isSessionLoaded) {
    return (
      <div className="min-h-screen bg-kitchen-steel flex items-center justify-center">
        <div className="animate-pulse text-2xl font-black italic uppercase tracking-tighter text-white">
          Calentando fogones...
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onEntry={handleEntry} />;
  }

  const isHostUser = isHost(session.email);

  // weekStart: Monday of current week (ISO date string for topic clusters)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  const weekStart = monday.toISOString().split('T')[0];

  const SortableDish = ({ project }: { project: Project }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: project.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 100 : 'auto',
    };

    return (
      <div ref={setNodeRef} style={style}>
        <DishCard 
          project={project} 
          dragHandleProps={{ ...attributes, ...listeners }} 
          canEdit={true}
        />
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-kitchen-steel text-white p-4 md:p-8 animate-in fade-in duration-700">
      <header className="max-w-6xl mx-auto mb-8 md:mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-8">
        <div className="flex items-center gap-4">
          <div className="bg-white/5 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl border border-white/10 shadow-inner overflow-hidden flex-shrink-0">
            <AvatarDisplay avatar={session.avatar} className="w-8 h-8 md:w-12 md:h-12 text-2xl md:text-4xl" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic leading-tight">
              Kitchen<span className="text-kitchen-cool underline">Sync</span>
            </h1>
            <p className="text-white/60 font-mono text-[10px] md:text-sm mt-1">
              CHEF: <span className="text-white font-bold">{session.name.toUpperCase()}</span> | ROL: <span className={isHostUser ? 'text-kitchen-hot font-bold' : 'text-kitchen-cool font-bold'}>{isHostUser ? 'MAÎTRE' : 'CHEF'}</span>
            </p>
          </div>
        </div>

        <div className="w-full md:w-auto order-3 md:order-2">
          <KitchenTimer isHost={isHostUser} />
        </div>
        
        <div className="flex items-center justify-between md:justify-end gap-4 md:order-3">
          <div className="flex gap-2 md:gap-4">
            <div className="bg-black/20 p-2 md:p-4 rounded-lg border border-white/5 min-w-[70px]">
              <span className="block text-[8px] md:text-[10px] font-mono opacity-50 uppercase">En marcha</span>
              <span className="text-xl md:text-2xl font-bold">{projects.filter(p => p.status !== 'served').length}</span>
            </div>
            <div className="bg-black/20 p-2 md:p-4 rounded-lg border border-white/5 min-w-[70px]">
              <span className="block text-[8px] md:text-[10px] font-mono opacity-50 uppercase">Críticos</span>
              <span className="text-xl md:text-2xl font-bold text-kitchen-hot">{projects.filter(p => p.temp >= 80).length}</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {isHostUser && (
              <>
                <button 
                  onClick={handleCloseSession}
                  className="p-3 bg-white/5 hover:bg-kitchen-hot/20 text-white hover:text-kitchen-hot rounded-xl border border-white/10 transition-all shadow-sm flex items-center gap-2 group"
                  title="Cerrar cocina y archivar sesión"
                >
                  <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Cerrar Cocina</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>

                <button 
                  onClick={handleClearKitchen}
                  className="p-3 bg-kitchen-hot/10 hover:bg-kitchen-hot text-kitchen-hot hover:text-white rounded-xl border border-kitchen-hot/20 transition-all shadow-sm"
                  title="Borrar platos de la sesión"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>

                <button 
                  onClick={() => setShowHostTransferModal(true)}
                  className="p-3 bg-kitchen-cool/10 hover:bg-kitchen-cool text-kitchen-cool hover:text-white rounded-xl border border-kitchen-cool/20 transition-all shadow-sm"
                  title="Transferir rol de Maître"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </button>
              </>
            )}

            <button 
              onClick={handleLogout}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
              title="Salir de la cocina"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
           <div className="flex bg-black/20 px-4 py-2 rounded-xl border border-white/5">
              <span className="text-[10px] md:text-xs font-mono text-white/60 tracking-widest uppercase text-center w-full">
               {isHostUser ? 'Panel del Maître' : 'Tu Estación de Trabajo'}
             </span>
          </div>
          
          <span className="hidden sm:block text-[10px] md:text-xs font-mono text-white/40 tracking-widest uppercase">
            Cocinando en Tiempo Real
          </span>
        </div>

        {!currentSession ? (
          <div className="flex flex-col items-center justify-center py-20 bg-black/20 rounded-[3rem] border-2 border-dashed border-white/10 animate-in fade-in zoom-in duration-700">
            <div className="text-8xl mb-8">🏪</div>
            <h2 className="text-4xl font-black italic uppercase text-white/40 tracking-tighter mb-4 text-center px-6">La cocina está cerrada</h2>
            {isHostUser ? (
              <div className="flex flex-col sm:flex-row gap-6 mt-8">
                <button 
                  onClick={() => handleCreateSession('monday')}
                  className={`${suggestedSession === 'monday' ? 'bg-kitchen-cool scale-105 ring-4 ring-blue-400/30' : 'bg-white/10 opacity-50'} hover:bg-kitchen-cool px-10 py-6 rounded-3xl font-black text-xl shadow-2xl transition-all transform active:scale-95 border-2 border-white/20`}
                >
                  📅 ABRIR LUNES {suggestedSession === 'monday' && '✨'}
                </button>
                <button 
                  onClick={() => handleCreateSession('friday')}
                  className={`${suggestedSession === 'friday' ? 'bg-kitchen-hot scale-105 ring-4 ring-red-400/30' : 'bg-white/10 opacity-50'} hover:bg-kitchen-hot px-10 py-6 rounded-3xl font-black text-xl shadow-2xl transition-all transform active:scale-95 border-2 border-white/20`}
                >
                  🥂 ABRIR VIERNES {suggestedSession === 'friday' && '✨'}
                </button>
              </div>
            ) : (
              <p className="text-white/20 font-mono uppercase tracking-[0.3em] text-xs">Esperando a que el Maître abra la sesión...</p>
            )}
          </div>
        ) : isReady && !isHostUser ? (
          <div className="flex flex-col items-center justify-center py-16 md:py-32 space-y-6 bg-black/20 rounded-[2rem] md:rounded-[3rem] border border-white/10 mt-8 animate-in zoom-in duration-500 shadow-2xl px-6 text-center">
            <div className="text-7xl md:text-9xl animate-bounce drop-shadow-2xl">🛎️</div>
            <h2 className="text-3xl md:text-4xl font-black italic uppercase text-kitchen-done tracking-tighter">¡Estación Lista!</h2>
            <p className="text-white/40 font-mono uppercase tracking-[0.2em] md:tracking-[0.3em] text-[10px] md:text-xs">Esperando el pase del Maître...</p>
            <button 
              onClick={() => setIsReady(false)} 
              className="mt-8 px-6 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all text-[10px] font-mono tracking-widest uppercase border border-white/5"
            >
              ← Volver a los fogones
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-12">
               <div className={`px-6 py-2 rounded-full border-2 font-black text-sm uppercase tracking-widest animate-pulse ${currentSession.type === 'monday' ? 'bg-kitchen-cool/20 border-kitchen-cool text-kitchen-cool' : 'bg-kitchen-hot/20 border-kitchen-hot text-kitchen-hot'}`}>
                 {currentSession.type === 'monday' ? '🗓️ Sesión de Planificación (Lunes)' : '🏆 Sesión de Resultados (Viernes)'}
               </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-8 items-stretch">
              <div className="flex-1 w-full">
                <AddDishForm chefId={session.name} profileId={session.profileId} sessionId={currentSession.id} />
              </div>
              {!isHostUser && (
                <button
                  onClick={() => {
                    setIsReady(true);
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3');
                    audio.play().catch(e => console.log('Audio error:', e));
                    supabase.channel('chef-signals').send({
                      type: 'broadcast',
                      event: 'chef-ready',
                      payload: { chef: session.name }
                    });
                  }}
                  className="bg-kitchen-done hover:bg-[#00B843] px-6 md:px-10 py-4 rounded-2xl font-black text-white shadow-xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 border-2 border-white/20 whitespace-nowrap h-[70px] md:h-[88px] w-full md:w-auto text-sm md:text-base"
                >
                  <span className="text-xl md:text-2xl">🛎️</span> ¡OÍDO COCINA!
                </button>
              )}
            </div>
            
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kitchen-cool"></div>
              </div>
            ) : (
              <>
                {!isHostUser ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={projects.filter(p => p.profile_id === session.profileId || p.chef_id === session.name).map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {projects.filter(p => p.profile_id === session.profileId || p.chef_id === session.name).length === 0 ? (
                          <div className="col-span-full text-center py-20 border-2 border-dashed border-white/10 rounded-3xl">
                            <p className="text-white/40 font-mono">Tu estación está vacía. Empieza a preparar un plato.</p>
                          </div>
                        ) : (
                          projects
                            .filter(p => p.profile_id === session.profileId || p.chef_id === session.name)
                            .map((project) => (
                              <SortableDish key={project.id} project={project} />
                            ))
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <MasterKitchenView 
                    projects={projects} 
                    chefAvatars={chefAvatars} 
                    currentChefName={session.name}
                  />
                )}
              </>
            )}
          </>
        )}

        <EvaluationRounds 
          isHost={isHostUser} 
          projects={projects} 
          historicalProjects={historicalProjects}
          currentUser={{ name: session.name, avatar: session.avatar, email: session.email }} 
        />

        {currentSession && (
          <TopicHeatmap
            sessionId={currentSession.id}
            weekStart={weekStart}
            isHost={isHostUser}
            projects={projects}
          />
        )}
      </div>

      <HostTransferModal
        isOpen={showHostTransferModal}
        onClose={() => setShowHostTransferModal(false)}
        isHost={isHostUser}
        transferHost={transferHost}
        chefAvatars={chefAvatars}
        currentUserEmail={session.email}
      />
    </main>
  );
}
