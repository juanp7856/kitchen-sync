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
  // Vibrant solid colors for dark backgrounds (no alpha = no muddy blending)
  if (confidence >= 0.95) return '#00C853';  // Emerald green (high confidence)
  if (confidence >= 0.85) return '#2979FF';  // Vivid blue
  if (confidence >= 0.7) return '#FFC107';  // Amber/warm
  return '#FF5252';                           // Coral red (low confidence)
}

function confidenceToLabel(confidence: number): string {
  if (confidence >= 0.95) return 'Tema fuerte';
  if (confidence >= 0.85) return 'Tema claro';
  if (confidence >= 0.7) return 'Tema moderado';
  return 'Tema disperso';
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
      console.log('[loadSavedClusters] allProjectIds count:', allProjectIds.length, 'unique:', [...new Set(allProjectIds)].length);

      if (allProjectIds.length === 0) {
        console.warn('[loadSavedClusters] No project_ids found in topic_cluster_projects');
        setStage('idle');
        return;
      }

      // Query 1: projects — chunked to avoid URL-too-long on .in() with 100+ UUIDs
      const projectIds = [...new Set(allProjectIds)].filter(Boolean);
      console.log('[loadSavedClusters] Querying', projectIds.length, 'project IDs. First 5:', projectIds.slice(0, 5));
      
      const BATCH_SIZE = 50;
      let allProjectsData: any[] = [];
      for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
        const batch = projectIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('projects')
          .select('id, title, temp, status, chef_id, profile_id')
          .in('id', batch);
        if (error) {
          console.error(`[loadSavedClusters] Batch ${i / BATCH_SIZE} error:`, JSON.stringify(error));
        }
        if (data) {
          allProjectsData.push(...data);
        }
      }
      console.log('[loadSavedClusters] allProjectsData count:', allProjectsData.length);

      // Query 2: profiles for those that have profile_id (also batched)
      const profileIds = [...new Set(allProjectsData.map(p => p.profile_id).filter(Boolean))];
      let profileMap = new Map<string, { name: string; avatar: string }>();
      if (profileIds.length > 0) {
        for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
          const batch = profileIds.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, avatar')
            .in('id', batch);
          if (error) {
            console.error(`[loadSavedClusters] Profiles batch ${i / BATCH_SIZE} error:`, JSON.stringify(error));
          }
          if (data) {
            data.forEach((p: any) => profileMap.set(p.id, { name: p.name, avatar: p.avatar }));
          }
        }
        console.log('[loadSavedClusters] profileMap size:', profileMap.size);
      }

      const projectMap = new Map(
        allProjectsData.map((p: any) => {
          const profile = p.profile_id ? profileMap.get(p.profile_id) : null;
          return [p.id, {
            id: p.id,
            title: p.title,
            chef_name: profile?.name ?? p.chef_id ?? 'Desconocido',
            chef_avatar: profile?.avatar ?? '👤',
            temp: p.temp ?? 20,
            status: p.status ?? 'cooking',
          }];
        })
      );
      console.log('[loadSavedClusters] projectMap size:', projectMap.size);

      const displays: ClusterDisplay[] = savedClusters.map((cluster: any) => {
        const projects = (cluster.topic_cluster_projects ?? [])
          .map((p: TopicClusterProject) => projectMap.get(p.project_id))
          .filter(Boolean);
        if (projects.length === 0) {
          console.warn('[loadSavedClusters] Empty projects for cluster:', cluster.theme_label, 'project_count:', cluster.project_count, 'tcp_count:', cluster.topic_cluster_projects?.length);
        }
        return {
          theme_label: cluster.theme_label,
          confidence: cluster.confidence,
          project_count: cluster.project_count,
          projects,
        };
      });

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

  // Filter and prepare data for Nivo — CAP to top 40 + "Otros" bucket
  const nivoData = useMemo(() => {
    let filtered = searchQuery.trim() 
      ? clusters.filter(c => 
          c.theme_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.projects.some(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : [...clusters];

    // 1. Noise filter: a theme with 1 dish is NOT a recurring theme
    filtered = filtered.filter(c => c.project_count >= 2);

    // 2. Sort by relevance (more dishes = more important)
    filtered.sort((a, b) => b.project_count - a.project_count);

    // 3. Cap to top 25; bucket the rest as "Otros"
    const TOP_N = 25;
    const topClusters = filtered.slice(0, TOP_N);
    const otherClusters = filtered.slice(TOP_N);

    const children: NivoNode[] = topClusters.map(c => ({
      name: c.theme_label,
      loc: c.project_count,
      confidence: c.confidence,
      projects: c.projects,
      color: confidenceToColor(c.confidence),
    }));

    // Intentionally NOT adding an "Otros" bucket — it devours the treemap.
    // The remaining ~145 themes are simply not visualized. Use the list view or search for them.

    return {
      name: 'Temas',
      color: 'transparent',
      children,
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
          className="group bg-kitchen-hot/20 hover:bg-kitchen-hot/30 disabled:opacity-50 disabled:cursor-not-allowed text-kitchen-hot font-bold px-5 py-3 rounded-xl border border-kitchen-hot/30 transition-all flex items-center gap-2 shadow-lg shadow-kitchen-hot/10 hover:shadow-kitchen-hot/20 whitespace-nowrap"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">🔥</span>
          Analizar temas
        </button>
        
        {stage === 'success' && clusters.length > 0 && (
          <div className="flex-1 w-full sm:w-auto relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar temas o platos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-kitchen-cool/50 focus:bg-white/[0.07] transition-all"
            />
          </div>
        )}
      </div>

      {/* Idle state helper */}
      {stage === 'idle' && (
        <div className="p-6 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <span className="text-2xl">🧠</span>
          </div>
          <div className="space-y-1">
            <p className="text-white/50 text-sm font-medium">Análisis semántico de platos</p>
            <p className="text-white/25 text-xs max-w-md mx-auto leading-relaxed">
              Descubre los temas recurrentes entre todos los platos usando inteligencia artificial local. 
              Los datos nunca salen del navegador.
            </p>
          </div>
        </div>
      )}

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
        <div className="p-8 bg-white/5 border border-white/10 rounded-2xl text-center space-y-3">
          <p className="text-4xl">🍽️</p>
          <p className="text-white/40 font-mono text-sm">No hay platos para analizar</p>
          <p className="text-white/20 text-xs">Agrega platos a la cocina primero</p>
        </div>
      )}

      {/* Stats + Treemap */}
      {stage === 'success' && clusters.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {/* Stats + Legend */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-white/40 font-mono text-xs uppercase tracking-widest">
              {clusters.length} temas encontrados • mostrando los 25 más relevantes
            </span>
            
            {/* Color Legend */}
            <div className="flex items-center gap-3 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
              <LegendItem color="#00C853" label="Fuerte (95%+" />
              <LegendItem color="#2979FF" label="Claro (85%+" />
              <LegendItem color="#FFC107" label="Moderado (70%+" />
              <LegendItem color="#FF5252" label="Disperso" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Treemap */}
            <div className="lg:col-span-2 h-[500px] bg-black/20 rounded-2xl border border-white/10 overflow-hidden">
              <ResponsiveTreeMap
                data={nivoData}
                identity="name"
                value="loc"
                valueFormat=""
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                label={(node: any) => {
                  // Show label on any block that can fit at least a few chars
                  if (node.width < 60 || node.height < 30) return '';
                  const name: string = node.data.name;
                  const count: number = node.data.loc;
                  // Compact: fewer chars per pixel so more blocks get labels
                  const maxChars = Math.max(6, Math.floor(node.width / 6.5));
                  const displayName = name.length > maxChars ? name.slice(0, maxChars - 2) + '..' : name;
                  // Two-line label: name + count
                  return `${displayName}\n(${count})`;
                }}
                labelSkipSize={40}
                labelTextColor="rgba(255,255,255,0.9)"
                labelPosition="center"
                labelPadding={8}
                parentLabelTextColor="transparent"
                borderWidth={2}
                borderColor="#000000"
                colors={{ datum: 'data.color' }}
                nodeOpacity={1}
                enableParentLabel={false}
                isInteractive={true}
                onClick={(node: any) => {
                  if (!node?.data?.name || node.data.name === 'Temas') return;
                  const cluster = clusters.find(c => c.theme_label === node.data.name);
                  if (cluster) setSelectedCluster(cluster);
                }}
                tooltip={({ node }: { node: any }) => (
                  <div className="bg-black/90 backdrop-blur border border-white/20 rounded-xl p-4 shadow-2xl max-w-xs">
                    <p className="text-white font-bold text-base mb-1">{node.data.name}</p>
                    <p className="text-white/60 text-sm">{node.data.loc} platos • {Math.round(node.data.confidence * 100)}% confianza</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {node.data.projects?.slice(0, 5).map((p: ProjectDetail, i: number) => (
                        <span key={i} className="text-[11px] text-white/50 bg-white/5 px-2 py-1 rounded">{p.title}</span>
                      ))}
                      {(node.data.projects?.length || 0) > 5 && (
                        <span className="text-[11px] text-white/30">+{node.data.projects.length - 5} más</span>
                      )}
                    </div>
                  </div>
                )}
                theme={{
                  labels: {
                    text: {
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'Geist Sans, system-ui, sans-serif',
                      fill: 'rgba(255,255,255,0.95)',
                      outlineWidth: 2,
                      outlineColor: 'rgba(0,0,0,0.7)',
                    }
                  },
                  tooltip: {
                    container: {
                      background: 'rgba(0,0,0,0.9)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                      padding: '16px',
                    }
                  }
                }}
              />
            </div>

            {/* Detail Panel */}
            <div className="bg-black/20 rounded-2xl border border-white/10 overflow-y-auto min-h-[500px] max-h-[500px]">
              {selectedCluster ? (
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-bold text-xl leading-tight">{selectedCluster.theme_label}</h3>
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ 
                            color: confidenceToColor(selectedCluster.confidence),
                            borderColor: confidenceToColor(selectedCluster.confidence) + '40',
                            backgroundColor: confidenceToColor(selectedCluster.confidence) + '15'
                          }}
                        >
                          {confidenceToLabel(selectedCluster.confidence)}
                        </span>
                      </div>
                      <p className="text-white/40 font-mono text-xs">
                        {selectedCluster.project_count} platos • {Math.round(selectedCluster.confidence * 100)}% confianza
                      </p>
                    </div>
                    <button 
                      onClick={() => setSelectedCluster(null)}
                      className="text-white/20 hover:text-white/60 text-lg transition-colors p-1 hover:bg-white/5 rounded-lg"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="h-px bg-white/10" />

                  {/* Unique chefs summary */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[...new Map(selectedCluster.projects.map(p => [p.chef_name, p])).values()].map((chef, i) => (
                      <div key={i} className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg">
                        <span className="text-sm">{chef.chef_avatar}</span>
                        <span className="text-[11px] text-white/60">{chef.chef_name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest mb-2">
                      Platos en este tema ({selectedCluster.projects.length})
                    </p>
                    {selectedCluster.projects.length === 0 && (
                      <div className="p-4 text-center">
                        <p className="text-white/20 text-xs">No se encontraron platos para este tema</p>
                        <p className="text-white/10 text-[10px] mt-1">Intenta regenerar el análisis</p>
                      </div>
                    )}
                    {selectedCluster.projects.map((project, idx) => (
                      <div 
                        key={project.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-white/[0.07] to-white/[0.03] hover:from-white/[0.12] hover:to-white/[0.06] transition-all border border-white/[0.08] hover:border-white/[0.15] group"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="relative">
                          <span className="text-2xl filter drop-shadow-lg">{project.chef_avatar}</span>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-white/20 border border-white/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate group-hover:text-white/90 transition-colors">{project.title}</p>
                          <p className="text-white/40 text-[11px] font-medium mt-0.5 flex items-center gap-1">
                            <span className="text-white/20">by</span> {project.chef_name}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <TempBadge temp={project.temp} status={project.status} />
                          <span className="text-[9px] text-white/20 font-mono">{project.temp}°</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center h-full flex flex-col items-center justify-center min-h-[400px]">
                  <div className="text-white/20 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="font-mono text-xs uppercase tracking-widest text-white/30">Explora los temas</p>
                      <p className="text-[11px] text-white/15 max-w-[200px] mx-auto">Haz click en cualquier bloque del mapa para ver los platos y chefs de ese tema</p>
                    </div>
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
    <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-2xl space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-kitchen-cool animate-pulse" />
          <span className="text-white/60 font-mono text-xs">{label}</span>
        </div>
        <span className="text-white/40 font-mono text-xs tabular-nums">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-kitchen-cool to-blue-400 transition-all duration-500 ease-out rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]" 
          style={{ width: `${Math.max(5, progress)}%` }} 
        />
      </div>
    </div>
  );
}

function TempBadge({ temp, status }: { temp: number; status: string }) {
  if (status === 'served') {
    return (
      <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-lg min-w-[24px] text-center border border-emerald-500/30 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        Listo
      </span>
    );
  }
  
  if (temp >= 80) {
    return (
      <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 rounded-lg min-w-[24px] text-center border border-red-500/30 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        {temp}°
      </span>
    );
  }
  
  if (temp >= 60) {
    return (
      <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-1 rounded-lg min-w-[24px] text-center border border-amber-500/30">
        {temp}°
      </span>
    );
  }

  return (
    <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-1 rounded-lg min-w-[24px] text-center border border-blue-500/30">
      {temp}°
    </span>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }} />
      <span className="text-[10px] text-white/50 font-mono">{label}</span>
    </div>
  );
}
