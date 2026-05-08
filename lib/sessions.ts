import { supabase } from './supabase';
import { KitchenSession, Project } from './types';

export async function cloneSession(type: 'monday' | 'friday'): Promise<KitchenSession | null> {
  // 1. Identify source session type (if Friday, clone from most recent Monday)
  const sourceSessionType = type === 'friday' ? 'monday' : 'friday';

  // 2. Fetch the most recent source session
  const { data: sourceSession, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('type', sourceSessionType)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (sessionError) {
    console.error('Error fetching source session:', sessionError);
    // Even if no source session, we should still create the new session
  }

  // 3. Create new session
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

  // 4. If we have a source session, clone its projects
  if (sourceSession) {
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('session_id', sourceSession.id);

    if (projectsError) {
      console.error('Error fetching projects to clone:', projectsError);
    } else if (projects && projects.length > 0) {
      const clonedProjects = projects.map((project: Project) => ({
        title: project.title,
        status: project.status,
        temp: project.temp,
        chef_id: project.chef_id,
        icon: project.icon,
        sort_order: project.sort_order,
        session_id: newSession.id,
        parent_id: project.id, // The current project becomes the parent
        version: project.version + 1,
      }));

      const { error: insertError } = await supabase
        .from('projects')
        .insert(clonedProjects);

      if (insertError) {
        console.error('Error inserting cloned projects:', insertError);
      }
    }
  }

  return newSession;
}
