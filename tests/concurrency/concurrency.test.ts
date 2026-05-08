import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { cloneSession } from '@/lib/sessions';

// Simulación de Base de Datos en Memoria para pruebas de concurrencia
let memoryDB = {
  projects: [] as any[],
  sessions: [
    { id: 'session-1', type: 'monday', status: 'active', created_at: new Date().toISOString() }
  ] as any[]
};

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        // Objeto de consulta aislado para esta llamada
        const queryState = {
          filters: [] as { column: string; value: any }[],
          operation: null as 'insert' | 'update' | 'delete' | 'select' | null,
          data: null as any
        };

        const query: any = {
          select: vi.fn().mockImplementation(() => {
            if (!queryState.operation) queryState.operation = 'select';
            return query;
          }),
          insert: vi.fn().mockImplementation((data: any) => {
            queryState.operation = 'insert';
            queryState.data = data;
            return query;
          }),
          update: vi.fn().mockImplementation((data: any) => {
            queryState.operation = 'update';
            queryState.data = data;
            return query;
          }),
          delete: vi.fn().mockImplementation(() => {
            queryState.operation = 'delete';
            return query;
          }),
          eq: vi.fn().mockImplementation((column: string, value: any) => {
            queryState.filters.push({ column, value });
            return query;
          }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnThis(),
          select_single: vi.fn().mockReturnThis(),
          
          // Ejecución real de la mutación al final de la cadena
          then: vi.fn().mockImplementation(async (resolve) => {
            let resultData: any = null;

            if (queryState.operation === 'insert') {
              const items = Array.isArray(queryState.data) ? queryState.data : [queryState.data];
              const createdItems = items.map(item => {
                const newItem = { 
                  ...item, 
                  id: item.id || Math.random().toString(36).substr(2, 9),
                  created_at: new Date().toISOString()
                };
                memoryDB[table as keyof typeof memoryDB].push(newItem);
                return newItem;
              });
              resultData = Array.isArray(queryState.data) ? createdItems : createdItems[0];
            } 
            else if (queryState.operation === 'delete') {
              const idFilter = queryState.filters.find(f => f.column === 'id');
              if (idFilter) {
                memoryDB[table as keyof typeof memoryDB] = memoryDB[table as keyof typeof memoryDB].filter(
                  (item: any) => item.id !== idFilter.value
                );
              }
              resultData = { data: [], error: null };
            }
            else {
              // Simular SELECT con filtrado básico por ID o Type
              let filtered = [...memoryDB[table as keyof typeof memoryDB]];
              queryState.filters.forEach(f => {
                filtered = filtered.filter(item => item[f.column] === f.value);
              });
              
              if (table === 'sessions') {
                // Ordenar por fecha para el .order()
                filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                resultData = filtered[0] || null;
              } else {
                resultData = filtered;
              }
            }

            return resolve({ data: resultData, error: null });
          })
        };
        return query;
      })
    }
  };
});

describe('Concurrent Interactions Simulation', () => {
  beforeEach(() => {
    memoryDB.projects = [];
    memoryDB.sessions = [
      { id: 'session-1', type: 'monday', status: 'active', created_at: new Date().toISOString() }
    ];
    vi.clearAllMocks();
  });

  it('should handle 10 chefs adding dishes simultaneously', async () => {
    const chefNames = ['Chef A', 'Chef B', 'Chef C', 'Chef D', 'Chef E', 'Chef F', 'Chef G', 'Chef H', 'Chef I', 'Chef J'];
    
    // Simulamos que 10 chefs envían un plato al mismo tiempo
    await Promise.all(chefNames.map(name => 
      supabase.from('projects').insert({
        title: `Especialidad de ${name}`,
        chef_id: name,
        session_id: 'session-1',
        version: 1,
        temp: 20,
        sort_order: Math.random() * 1000
      })
    ));

    expect(memoryDB.projects).toHaveLength(10);
    const uniqueChefs = new Set(memoryDB.projects.map(p => p.chef_id));
    expect(uniqueChefs.size).toBe(10);
  });

  it('should maintain data integrity during session cloning with high load', async () => {
    // 1. Llenamos el lunes con 50 platos
    for (let i = 0; i < 50; i++) {
      memoryDB.projects.push({
        id: `p-${i}`,
        title: `Plato Lunes ${i}`,
        session_id: 'session-1',
        version: 1,
        chef_id: 'Chef Test'
      });
    }

    // 2. Ejecutamos la clonación a Viernes
    // Esto disparará la lógica de lib/sessions.ts que lee de la DB y escribe la nueva
    await cloneSession('friday');

    // 3. Verificamos resultados
    // Deben haber 100 proyectos ahora (50 originales + 50 clonados)
    expect(memoryDB.projects).toHaveLength(100);
    
    const fridayProjects = memoryDB.projects.filter(p => p.version === 2);
    expect(fridayProjects).toHaveLength(50);
    expect(fridayProjects[0].parent_id).toBeDefined();
    expect(fridayProjects[0].session_id).not.toBe('session-1');
  });

  it('should simulate rapid add/delete cycles from different users', async () => {
    // Usuario 1 agrega 5 platos
    const user1Actions = Promise.all([1, 2, 3, 4, 5].map(i => 
      supabase.from('projects').insert({ id: `u1-${i}`, title: `User 1 Dish ${i}`, session_id: 'session-1' })
    ));

    // Usuario 2 agrega 5 platos
    const user2Actions = Promise.all([1, 2, 3, 4, 5].map(i => 
      supabase.from('projects').insert({ id: `u2-${i}`, title: `User 2 Dish ${i}`, session_id: 'session-1' })
    ));

    await Promise.all([user1Actions, user2Actions]);
    expect(memoryDB.projects).toHaveLength(10);
  });

  it('should handle interleaved INSERT and DELETE without clearing the state (Race Condition Test)', async () => {
    // 1. Empezamos con 5 platos
    for (let i = 0; i < 5; i++) {
      memoryDB.projects.push({ id: `initial-${i}`, title: `Initial ${i}`, session_id: 'session-1' });
    }

    // 2. Simulamos ráfaga de acciones intercaladas
    // Chef A agrega platos mientras Chef B borra platos iniciales
    const actions = [
      supabase.from('projects').insert({ id: 'new-1', title: 'New 1', session_id: 'session-1' }),
      supabase.from('projects').delete().eq('id', 'initial-0'),
      supabase.from('projects').insert({ id: 'new-2', title: 'New 2', session_id: 'session-1' }),
      supabase.from('projects').delete().eq('id', 'initial-1'),
      supabase.from('projects').insert({ id: 'new-3', title: 'New 3', session_id: 'session-1' }),
      supabase.from('projects').delete().eq('id', 'initial-2'),
    ];

    // Ejecutamos todo en paralelo
    await Promise.all(actions);

    // 3. Verificación de integridad
    // Teníamos 5, agregamos 3 (+3=8), borramos 3 (-3=5).
    // El resultado DEBE ser exactamente 5. 
    // Si hubiera un bug de "limpiar todo", tendríamos 0 o un número incorrecto.
    const remainingIds = memoryDB.projects.map(p => p.id);
    
    expect(memoryDB.projects).toHaveLength(5);
    expect(remainingIds).toContain('new-1');
    expect(remainingIds).toContain('new-2');
    expect(remainingIds).toContain('new-3');
    expect(remainingIds).not.toContain('initial-0');
    expect(remainingIds).not.toContain('initial-1');
  });
});
