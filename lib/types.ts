export interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served';
  temp: number;
  chef_id: string;
  icon?: string;
  sort_order: number;
  session_id?: string;
  parent_id?: string;
  version: number;
}

export interface KitchenSession {
  id: string;
  type: 'monday' | 'friday';
  status: 'active' | 'closed';
  created_at: string;
}
