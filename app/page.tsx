'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DishCard from '@/components/DishCard';
import AddDishForm from '@/components/AddDishForm';
import KitchenTimer from '@/components/KitchenTimer';
import MasterKitchenView from '@/components/MasterKitchenView';
import AuthScreen from '@/components/auth/AuthScreen';
import MultiplayerCursors from '@/components/MultiplayerCursors';
import EvaluationRounds from '@/components/EvaluationRounds';
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
import { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface UserSession {
  name: string;
  role: 'chef' | 'host';
  avatar: string;
}

export default function KitchenPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [chefAvatars, setChefAvatars] = useState<Record<string, { avatar: string; isReady: boolean }>>({});
  const [cursors, setCursors] = useState<Record<string, any>>({});
  const [presenceChannel, setPresenceChannel] = useState<any>(null);

  useEffect(() => {
    // 0. Recuperar sesión con efecto de entrada fluido
    const savedSession = localStorage.getItem('kitchen-sync-session');
    const parsedSession = savedSession ? JSON.parse(savedSession) : null;
    if (parsedSession) {
      setSession(parsedSession);
    }
    setIsSessionLoaded(true);

    // 1. Carga inicial
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error) {
        setProjects(data || []);
      }
      setLoading(false);
    };

    fetchProjects();

    // 2. Suscripción de Proyectos
    const projectsChannel = supabase
      .channel('public:projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newProject = payload.new as Project;
          setProjects((current) => {
            if (current.find(p => p.id === newProject.id)) return current;
            return [...current, newProject].sort((a, b) => a.sort_order - b.sort_order);
          });
        } 
        else if (payload.eventType === 'UPDATE') {
          const updatedProject = payload.new as Project;
          setProjects((current) => 
            current.map(p => p.id === updatedProject.id ? updatedProject : p)
                   .sort((a, b) => a.sort_order - b.sort_order)
          );
        } 
        else if (payload.eventType === 'DELETE') {
          setProjects((current) => current.filter(p => p.id === payload.old.id));
        }
      })
      .subscribe();

    // 3. Suscripción Única de Presencia
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
        const formattedCursors: Record<string, any> = {};
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as any[];
          if (presences && presences.length > 0) {
            const presence = presences[0];
            avatars[key] = { 
              avatar: presence.avatar, 
              isReady: presence.isReady || false 
            };
            
            // Si no somos nosotros y tiene posición, añadir al mapa de cursores
            if (key !== parsedSession?.name && presence.x !== undefined) {
              formattedCursors[key] = {
                id: key,
                name: key,
                avatar: presence.avatar,
                x: presence.x,
                y: presence.y
              };
            }
          }
        });
        setChefAvatars(avatars);
        setCursors(formattedCursors);
      })
      .subscribe();

    setPresenceChannel(pChannel);

    return () => {
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(pChannel);
    };
  }, []);

  // Sincronizar estado local isReady con presencia se maneja ahora en MultiplayerCursors
  // para evitar colisiones de track()

  useEffect(() => {
    if (!session) return;
    const signalChannel = supabase.channel('chef-signals');
    signalChannel
      .on('broadcast', { event: 'chef-ready' }, () => {
        if (session.role === 'host') {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3');
          audio.play().catch(e => console.log('Audio error:', e));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(signalChannel);
    };
  }, [session]);

  const handleEntry = (userData: UserSession) => {
    setSession(userData);
    localStorage.setItem('kitchen-sync-session', JSON.stringify(userData));
  };

  const handleClearKitchen = async () => {
    if (!window.confirm('🚨 ¿ESTÁS SEGURO? Esto eliminará TODOS los platos de la cocina de forma permanente.')) return;
    
    // Actualización optimista para que los contadores se pongan a cero inmediatamente
    setProjects([]);

    const { error } = await supabase
      .from('projects')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error clearing kitchen:', error);
      alert('Error al limpiar la cocina');
      // Si falla, recargar los proyectos (opcional, o dejar que el tiempo real lo maneje)
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kitchen-sync-session');
    setSession(null);
  };

  // Sensores para DND
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Permite clics normales; el arrastre solo inicia tras mover 8px
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
      
      // Actualización optimista del estado local
      setProjects(newOrder);

      // Actualizar en Supabase (solo los afectados para ser eficientes)
      // En un MVP simple, podemos actualizar el sort_order del elemento movido
      // basándonos en sus vecinos.
      const movedItem = newOrder[newIndex];
      const prevItem = newOrder[newIndex - 1];
      const nextItem = newOrder[newIndex + 1];

      let finalSortOrder = 0;
      if (!prevItem) finalSortOrder = nextItem.sort_order - 1000;
      else if (!nextItem) finalSortOrder = prevItem.sort_order + 1000;
      else finalSortOrder = (prevItem.sort_order + nextItem.sort_order) / 2;

      const { error } = await supabase
        .from('projects')
        .update({ sort_order: finalSortOrder })
        .eq('id', movedItem.id);

      if (error) console.error('Error actualizando orden:', error);
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

  const isHost = session.role === 'host';

  // Componente interno para platos arrastrables
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
      <MultiplayerCursors 
        userName={session.name} 
        userAvatar={session.avatar} 
        isReady={isReady}
        cursors={cursors}
        channel={presenceChannel}
      />
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
              CHEF: <span className="text-white font-bold">{session.name.toUpperCase()}</span> | ROL: <span className={isHost ? 'text-kitchen-hot font-bold' : 'text-kitchen-cool font-bold'}>{session.role.toUpperCase()}</span>
            </p>
          </div>
        </div>

        <div className="w-full md:w-auto order-3 md:order-2">
          <KitchenTimer isHost={isHost} />
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
            {isHost && (
              <button 
                onClick={handleClearKitchen}
                className="p-3 bg-kitchen-hot/10 hover:bg-kitchen-hot text-kitchen-hot hover:text-white rounded-xl border border-kitchen-hot/20 transition-all shadow-sm"
                title="Borrar todos los platos"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
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
               {isHost ? 'Panel del Maître' : 'Tu Estación de Trabajo'}
             </span>
          </div>
          
          <span className="hidden sm:block text-[10px] md:text-xs font-mono text-white/40 tracking-widest uppercase">
            {isHost ? 'Navegación Táctica (Zoom/Pan)' : 'Cocinando en Tiempo Real'}
          </span>
        </div>

        {isReady && !isHost ? (
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
            <div className="flex flex-col md:flex-row gap-4 mb-8 items-stretch">
              <div className="flex-1 w-full">
                <AddDishForm chefId={session.name} />
              </div>
              {!isHost && (
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
                {!isHost ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={projects.filter(p => p.chef_id === session.name).map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {projects.filter(p => p.chef_id === session.name).length === 0 ? (
                          <div className="col-span-full text-center py-20 border-2 border-dashed border-white/10 rounded-3xl">
                            <p className="text-white/40 font-mono">Tu estación está vacía. Empieza a preparar un plato.</p>
                          </div>
                        ) : (
                          projects
                            .filter(p => p.chef_id === session.name)
                            .map((project) => (
                              <SortableDish key={project.id} project={project} />
                            ))
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <MasterKitchenView projects={projects} chefAvatars={chefAvatars} />
                )}
              </>
            )}
          </>
        )}

        <EvaluationRounds 
          isHost={isHost} 
          projects={projects} 
          currentUser={{ name: session.name, avatar: session.avatar }} 
        />
      </div>
    </main>
  );
}
