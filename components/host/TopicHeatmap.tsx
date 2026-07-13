'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { supabase } from '@/lib/supabase';
import { runClustering } from '@/lib/topicClusters';
import type { ClusterResult, TopicClusterProject } from '@/lib/types';

interface ProjectDetail {
  id: string;
  title: string;
  chef_name: string;
  chef_avatar: string;
  temp: number;
  status: string;
}

interface ClusterDisplay {
  theme_label: string;
  confidence: number;
  project_count: number;
  projects: ProjectDetail[];
}

interface NivoNode {
  name: string;
  loc: number;
  confidence: number;
  projects: ProjectDetail[];
  color?: string;
}

interface TopicHeatmapProps {
  weekStart: string;
  isHost: boolean;
}

type Stage = 'idle' | 'loading' | 'embedding' | 'clustering' | 'success' | 'error' | 'empty';

function confidenceToColor(confidence: number): string {
  if (confidence >= 0.95) return '#00B843'; // kitchen-done
  if (confidence >= 0.8) return '#3B82F6';    // blue
  if (confidence >= 0.6) return '#EAB308';    // yellow
  return '#EF4444';                           // red
}

export default function TopicHeatmap({ weekStart, isHost }: TopicHeatmapProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterDisplay[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDisplay | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load saved clusters on mount
  useEffect(() => {
    loadSavedClusters();
  }, [weekStart]);

  async function loadSavedClusters() {
    try {
      const { data: savedClusters, error: queryError } = await supabase
        .from('topic_clusters')
        .select('*, topic_cluster_projects(*)')
        .eq('week_start', weekStart)
        .order('project_count', { ascending: false });

      if (queryError || !savedClusters || savedClusters.length === 0) {
        setStage('idle');
        return;
      }

      const allProjectIds = savedClusters.flatMap((c: any) => 
        c.topic_cluster_projects?.map((p: TopicClusterProject) => p.project_id) ?? []
      );

      const { data: projectsData } = await supabase
        .from('projects')
        .select('id, title, temp, status, chef_id, profile_id, profiles(name, avatar)')
        .in('id', [...new Set(allProjectIds)]);

      const projectMap = new Map(
        (projectsData ?? []).map((p: any) => [p.id, {
          id: p.id,
          title: p.title,
          chef_name: p.profiles?.name ?? p.chef_id ?? 'Desconocido',
          chef_avatar: p.profiles?.avatar ?? '👤',
          temp: p.temp ?? 20,
          status: p.status ?? 'cooking',
        }])
      );

      const displays: ClusterDisplay[] = savedClusters.map((cluster: any) => ({
        theme_label: cluster.theme_label,
        confidence: cluster.confidence,
        project_count: cluster.project_count,
        projects: (cluster.topic_cluster_projects ?? [])
          .map((p: TopicClusterProject) => projectMap.get(p.project_id))
          .filter(Boolean),
      }));

      setClusters(displays);
      setStage('success');
    } catch (err) {
      console.error('Failed to load saved clusters:', err);
      setStage('idle');
    }
  }

  const handleRunClustering = useCallback(async () => {
    setStage('loading');
    setError(null);
    setProgress(0);
    setSelectedCluster(null);

    try {
      const { data: allProjectsData, error: queryError } = await supabase
        .from('projects')
        .select('id, title, temp, status, chef_id, profile_id, profiles(name, avatar)')
        .not('title', 'is', null);

      if (queryError) throw new Error(`Failed to fetch projects: ${queryError.message}`);
      
      const titles = (allProjectsData ?? []).map((p: any) => ({ 
        id: p.id, 
        title: p.title 
      }));

      if (titles.length === 0) {
        setStage('empty');
        setClusters([]);
        return;
      }

      const results = await runClustering(titles, { weekStart }, (stage, progress) => {
        if (stage === 'loading') setStage('loading');
        else if (stage === 'embedding') setStage('embedding');
        else if (stage === 'clustering') setStage('clustering');
        setProgress(progress);
      });

      if (results.length === 0) {
        setStage('empty');
        setClusters([]);
        return;
      }

      const clusterMap = new Map<string, ClusterResult[]>();
      for (const r of results) {
        if (!clusterMap.has(r.cluster_label)) clusterMap.set(r.cluster_label, []);
        clusterMap.get(r.cluster_label)!.push(r);
      }

      const projectMap = new Map(
        (allProjectsData ?? []).map((p: any) => [p.id, {
          id: p.id,
          title: p.title,
          chef_name: p.profiles?.name ?? p.chef_id ?? 'Desconocido',
          chef_avatar: p.profiles?.avatar ?? '👤',
          temp: p.temp ?? 20,
          status: p.status ?? 'cooking',
        }])
      );

      const displays: ClusterDisplay[] = [];
      for (const [label, members] of clusterMap.entries()) {
        const projects = members.map(m => projectMap.get(m.project_id)).filter(Boolean) as ProjectDetail[];
        const avgConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;

        displays.push({
          theme_label: label,
          confidence: avgConfidence,
          project_count: members.length,
          projects,
        });
      }

      displays.sort((a, b) => b.project_count - a.project_count);
      setClusters(displays);
      setStage('success');
    } catch (err) {
      console.error('[TopicHeatmap] Clustering error:', err);
      const errorMessage = err instanceof Error 
        ? `Error: ${err.message}` 
        : 'Error desconocido al analizar temas.';
      setError(errorMessage);
      setStage('error');
    }
  }, [weekStart]);

  // Filter and prepare data for Nivo
  const nivoData = useMemo(() => {
    const filtered = searchQuery.trim() 
      ? clusters.filter(c => 
          c.theme_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.projects.some(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : clusters;

    return {
      name: 'Temas',
      color: 'transparent',
      children: filtered.map(c => ({
        name: c.theme_label,
        loc: c.project_count,
        confidence: c.confidence,
        projects: c.projects,
        color: confidenceToColor(c.confidence),
      })),
    };
  }, [clusters, searchQuery]);

  const totalProjects = useMemo(() => clusters.reduce((sum, c) => sum + c.project_count, 0), [clusters]);

  if (!isHost) return null;

  return (
    <div className="mt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <button
          onClick={handleRunClustering}
          disabled={stage !== 'idle' && stage !== 'success' && stage !== 'error' && stage !== 'empty'}
          className="bg-kitchen-hot/20 hover:bg-kitchen-hot/30 disabled:opacity-50 disabled:cursor-not-allowed text-kitchen-hot font-bold px-5 py-3 rounded-xl border border-kitchen-hot/30 transition-all flex items-center gap-2 shadow-lg whitespace-nowrap"
        >
          <span className="text-xl">🔥</span>
          Analizar temas
        </button>
        
        {stage === 'success' && clusters.length > 0 && (
          <div className="flex-1 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Buscar temas o platos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-kitchen-cool"
            />
          </div>
        )}
      </div>

      {/* Progress */}
      {stage === 'loading' && <ProgressBar label="Descargando modelo..." progress={progress} />}
      {stage === 'embedding' && <ProgressBar label="Generando embeddings..." progress={progress} />}
      {stage === 'clustering' && <ProgressBar label="Agrupando temas..." progress={progress} />}

      {/* Error */}
      {stage === 'error' && (
        <div className="p-4 bg-kitchen-hot/20 border border-kitchen-hot/30 rounded-xl">
          <p className="text-kitchen-hot font-mono text-sm mb-2">❌ Error</p>
          <p className="text-white/60 font-mono text-xs">{error}</p>
          <button onClick={() => setStage('idle')} className="mt-2 text-xs text-white/40 hover:text-white">Reintentar</button>
        </div>
      )}

      {/* Empty */}
      {stage === 'empty' && (
        <div className="p-6 bg-white/5 border border-white/10 rounded-xl text-center">
          <p className="text-white/40 font-mono text-sm">No hay platos para analizar</p>
        </div>
      )}

      {/* Stats + Treemap */}
      {stage === 'success' && clusters.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-white/40 font-mono text-xs uppercase tracking-widest">
            <span>{clusters.length} temas • {totalProjects} platos totales</span>
            <span>Click para ver detalle</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Treemap */}
            <div className="lg:col-span-2 h-[500px] bg-black/20 rounded-2xl border border-white/10 overflow-hidden">
              <ResponsiveTreeMap
                data={nivoData}
                identity="name"
                value="loc"
                valueFormat=",.0d"
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                label={(node: any) => `${node.data.name} (${node.data.loc})`}
                labelSkipSize={40}
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
                parentLabelTextColor="white"
                borderWidth={2}
                borderColor="rgba(255,255,255,0.1)"
                colors={{ datum: 'data.color' }}
                nodeOpacity={0.9}
                enableParentLabel={false}
                isInteractive={true}
                onClick={(node: any) => {
                  const cluster = clusters.find(c => c.theme_label === node.data.name);
                  if (cluster) setSelectedCluster(cluster);
                }}
                tooltip={({ node }: { node: any }) => (
                  <div className="bg-black/80 backdrop-blur border border-white/20 rounded-xl p-3 shadow-2xl max-w-xs">
                    <p className="text-white font-bold text-sm">{node.data.name}</p>
                    <p className="text-white/60 text-xs">{node.data.loc} platos • {Math.round(node.data.confidence * 100)}% confianza</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.data.projects?.slice(0, 3).map((p: ProjectDetail, i: number) => (
                        <span key={i} className="text-[10px] text-white/40">{p.title}</span>
                      ))}
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Detail Panel */}
            <div className="bg-black/20 rounded-2xl border border-white/10 overflow-hidden">
              {selectedCluster ? (
                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="text-white font-bold text-xl">{selectedCluster.theme_label}</h3>
                    <p className="text-white/40 font-mono text-xs mt-1">
                      {selectedCluster.project_count} platos • {Math.round(selectedCluster.confidence * 100)}% confianza
                    </p>
                  </div>

                  <div className="h-px bg-white/10" />

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest">
                      Platos en este tema
                    </p>
                    {selectedCluster.projects.map((project) => (
                      <div 
                        key={project.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <span className="text-lg">{project.chef_avatar}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/80 text-sm truncate">{project.title}</p>
                          <p className="text-white/30 text-[10px] font-mono">
                            {project.chef_name} • {project.temp}°
                          </p>
                        </div>
                        <TempBadge temp={project.temp} status={project.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center h-full flex items-center justify-center">
                  <div className="text-white/20 space-y-2">
                    <p className="text-4xl">👆</p>
                    <p className="font-mono text-xs uppercase tracking-widest">Click en un tema para ver detalle</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex justify-between mb-2">
        <span className="text-white/60 font-mono text-xs">{label}</span>
        <span className="text-white/40 font-mono text-xs">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-kitchen-cool transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function TempBadge({ temp, status }: { temp: number; status: string }) {
  let color = 'bg-kitchen-cool';
  let label = 'OK';
  
  if (status === 'served') {
    color = 'bg-kitchen-done';
    label = '✓';
  } else if (temp >= 80) {
    color = 'bg-kitchen-hot';
    label = '!';
  } else if (temp >= 60) {
    color = 'bg-yellow-500';
    label = '~';
  }

  return (
    <span className={`${color} text-white text-[10px] font-bold px-2 py-1 rounded-md min-w-[24px] text-center`}>
      {label}
    </span>
  );
}
