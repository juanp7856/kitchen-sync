import { supabase } from './supabase';
import { KitchenSession, Project } from './types';

export async function cloneSession(type: 'monday' | 'friday'): Promise<KitchenSession | null> {
  // 1. Create new session
  const { data: newSession, error: createError } = await supabase
    .from('sessions')
    .insert({
      type,
      status: 'active',
    })
    .select()
    .single();

  if (createError || !newSession) {
    console.error('Error creating new session:', createError);
    return null;
  }

  // 2. Only clone projects if it's a Friday session (from most recent Monday)
  if (type === 'friday') {
    // Fetch the most recent Monday session
    const { data: sourceSession, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('type', 'monday')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sessionError && sourceSession) {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('session_id', sourceSession.id);

      if (!projectsError && projects && projects.length > 0) {
        const clonedProjects = projects.map((project: Project) => ({
          title: project.title,
          status: project.status,
          temp: project.temp,
          chef_id: project.chef_id,
          icon: project.icon,
          sort_order: project.sort_order,
          session_id: newSession.id
        }));

        const { error: insertError } = await supabase
          .from('projects')
          .insert(clonedProjects);

        if (insertError) {
          console.error('Error inserting cloned projects:', insertError);
        }
      }
    }
  }

  return newSession;
}
