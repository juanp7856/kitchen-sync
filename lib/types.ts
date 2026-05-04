export interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served';
  temp: number;
  chef_id: string;
  icon?: string;
  sort_order: number;
}
