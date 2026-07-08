export interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served' | 'cooking';
  temp: number;
  chef_id: string;
  icon?: string;
  sort_order: number;
  session_id?: string;
}

export interface KitchenSession {
  id: string;
  type: 'monday' | 'friday';
  status: 'active' | 'closed';
  created_at: string;
}

export interface AppSettings {
  id: 1;
  current_host_email: string;
}
