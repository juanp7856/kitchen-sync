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

interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served';
  temp: number;
  chef_id: string;
  icon?: string;
  sort_order: number;
}

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

  useEffect(() => {
    // 0. Recuperar sesión con efecto de entrada fluido
    const savedSession = localStorage.getItem('kitchen-sync-session');
    if (savedSession) {
      setSession(JSON.parse(savedSession));
    }
    setIsSessionLoaded(true);

    // 1. Carga inicial
    const fetchProjects = async () => {
      console.log('--- KitchenSync: Iniciando carga de proyectos ---');
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('KitchenSync Error [Fetch]:', error);
      } else {
        console.log('KitchenSync: Proyectos cargados con éxito:', data?.length, 'platos encontrados');
        setProjects(data || []);
      }
      setLoading(false);
    };

    fetchProjects();

    // 2. Suscripción en tiempo real
    console.log('--- KitchenSync: Conectando con la cocina en vivo ---');
    const channel = supabase
      .channel('public:projects')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          console.log('--- EVENTO DE COCINA RECIBIDO ---', payload.eventType);
          
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
        }
      )
      .subscribe((status) => {
        console.log('KitchenSync: Estado de la conexión:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error clearing kitchen:', error);
      alert('Error al limpiar la cocina');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kitchen-sync-session');
    setSession(null);
  };

  // Sensores para DND
  const sensors = useSensors(
    useSensor(PointerSensor),
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
    <main className="min-h-screen bg-kitchen-steel text-white p-8 animate-in fade-in duration-700">
      <MultiplayerCursors userName={session.name} userAvatar={session.avatar} />
      <header className="max-w-6xl mx-auto mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-8">
        <div className="flex items-center gap-4">
          <div className="text-4xl bg-white/5 w-16 h-16 flex items-center justify-center rounded-2xl border border-white/10 shadow-inner">
            {session.avatar}
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
              Kitchen<span className="text-kitchen-cool underline">Sync</span>
            </h1>
            <p className="text-white/60 font-mono text-sm mt-1">
              CHEF: <span className="text-white font-bold">{session.name.toUpperCase()}</span> | ROL: <span className={isHost ? 'text-kitchen-hot font-bold' : 'text-kitchen-cool font-bold'}>{session.role.toUpperCase()}</span>
            </p>
          </div>
        </div>

        <KitchenTimer isHost={isHost} />
        
        <div className="flex items-center gap-4">
          <div className="flex gap-4">
            <div className="bg-black/20 p-4 rounded-lg border border-white/5">
              <span className="block text-[10px] font-mono opacity-50 uppercase">En marcha</span>
              <span className="text-2xl font-bold">{projects.filter(p => p.status !== 'served').length}</span>
            </div>
            <div className="bg-black/20 p-4 rounded-lg border border-white/5">
              <span className="block text-[10px] font-mono opacity-50 uppercase">Críticos</span>
              <span className="text-2xl font-bold text-kitchen-hot">{projects.filter(p => p.temp >= 80).length}</span>
            </div>
          </div>
          
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
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex bg-black/20 px-4 py-2 rounded-xl border border-white/5">
             <span className="text-xs font-mono text-white/60 tracking-widest uppercase">
               {isHost ? 'Panel del Maître' : 'Tu Estación de Trabajo'}
             </span>
          </div>
          
          <span className="text-xs font-mono text-white/40 tracking-widest uppercase">
            {isHost ? 'Navegación Táctica (Zoom/Pan)' : 'Cocinando en Tiempo Real'}
          </span>
        </div>

        {!isHost ? (
          isReady ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-6 bg-black/20 rounded-[3rem] border border-white/10 mt-8 animate-in zoom-in duration-500 shadow-2xl">
              <div className="text-9xl animate-bounce drop-shadow-2xl">🛎️</div>
              <h2 className="text-4xl font-black italic uppercase text-kitchen-done tracking-tighter">¡Estación Lista!</h2>
              <p className="text-white/40 font-mono uppercase tracking-[0.3em] text-xs">Esperando el pase del Maître...</p>
              <button 
                onClick={() => setIsReady(false)} 
                className="mt-8 px-6 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all text-[10px] font-mono tracking-widest uppercase border border-white/5"
              >
                ← Volver a los fogones
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row gap-4 mb-4 items-stretch">
                <div className="flex-1">
                  <AddDishForm chefId={session.name} />
                </div>
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
                  className="bg-kitchen-done hover:bg-[#00B843] px-10 py-4 rounded-2xl font-black text-white shadow-xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 border-2 border-white/20 whitespace-nowrap h-[88px] w-full md:w-auto"
                >
                  <span className="text-2xl">🛎️</span> ¡OÍDO COCINA!
                </button>
              </div>
              
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kitchen-cool"></div>
                </div>
              ) : (
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
              )}
            </>
          )
        ) : (
          <MasterKitchenView projects={projects} />
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
