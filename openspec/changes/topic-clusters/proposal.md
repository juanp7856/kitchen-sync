# Proposal: Weekly Topic Clusters (Análisis de Temas) in KitchenSync

## Intent

El host (Maître) de una sesión no tiene visibilidad agregada de qué temas se repiten entre los platos de la semana. Los títulos varían entre nombres de producto (`CLAIMS.AI`, `RulesLAB`, `Emailage`) y descripciones (`Fix AOD`, `Integración con AOD`), así que un agrupamiento por texto exacto no detecta similitud semántica (AOD como tema común). Necesitamos un "mapa de calor temático" semanal que clusterice títulos por significado y entregue al host una lista de "temas calientes" con contador y ejemplos — corriendo 1 vez por semana, bajo demanda, sin que los datos salgan del navegador.

## Scope

### In Scope
- `topic_clusters` table: `id`, `session_id`, `week_start`, `theme_name`, `count`, `confidence`, `created_at`
- `topic_cluster_projects` junction table: `id`, `topic_cluster_id`, `project_id`, `profile_id` (nullable, FK to `profiles`), `chef_name` (nullable, for legacy projects)
- Embeddings in-browser con `@xenova/transformers` + `all-MiniLM-L6-v2` (~80MB, multilingüe ES/EN) — lazy dynamic import, cacheado en IndexedDB
- Clusterización JS (DBSCAN con similitud coseno, `minPts=2`) — agrupa `Fix AOD` + `Integración con AOD`; nombres de producto quedan como clusters unitarios
- Acción host-only "🔥 Analizar temas" → pipeline: `SELECT title FROM projects WHERE session_id = ?` → embed → cluster → label → INSERT en `topic_clusters`
- Visualización `TopicHeatmap`: lista de temas calientes con contador, ejemplos de títulos y barra de confianza
- Privacidad: CERO datos salen del navegador; embeddings nunca se persisten ni transmiten (solo los clusters resultantes a Supabase)

### Out of Scope
- Clustering en tiempo real / automático (trigger manual semanal)
- Análisis histórico cross-sesión o tendencias multi-semana (futuro: `week_start` ya soporta)
- RLS / restricción DB de host-only (gate UI en `useHostManager`, mismo no-RLS arch)
- pgvector server-side (los embeddings no salen del browser; futuro si escala)
- Fine-tuning del modelo o vocabulario custom

## Capabilities

### New
- `topic-clusters`: agrupamiento semántico semanal de títulos de platos vía embeddings locales en el navegador, entregando al host un reporte de "temas calientes" persistido en `topic_clusters`

### Modified
None — ningún spec existente cubre análisis/reportes. Lectura read-only de la tabla `projects` existente.

## Approach

1. **SQL**: migration `003_topic_clusters.sql` — `topic_clusters` DDL + `topic_cluster_projects` junction table (additive, non-breaking)
2. **Modelo**: dynamic `import('@xenova/transformers')` la primera vez; pipeline cachea en IndexedDB. UI muestra progreso de descarga (~80MB) y ofrece "cancelar"
3. **Pipeline** (`lib/topicClusters.ts`): fetch titles → embed (batch para no saturar memoria) → DBSCAN coseno `minPts=2` → label por tokens representativos del cluster → ruido cae en bucket "Sin tema claro"
4. **UI**: botón "🔥 Analizar temas" visible solo si `useHostManager(session.email).isHost`. Loading state cubre warmup del modelo. Resultado render en `TopicHeatmap`
5. **Persistencia**: `INSERT` filas de clusters para la `week_start` actual; re-ejecutar reemplaza la semana (o agrega, a definir en spec)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sql/migrations/003_topic_clusters.sql` | New | `topic_clusters` + `topic_cluster_projects` DDL |
| `lib/topicClusters.ts` | New | pipeline embed → cluster → label |
| `lib/types.ts` | Modified | `TopicCluster` type |
| `components/host/TopicHeatmap.tsx` | New | visualización de temas calientes |
| `app/page.tsx` | Modified | botón host-only + render heatmap |
| `package.json` | Modified | add `@xenova/transformers` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Descarga 80MB falla/lenta en primera ejecución | High | Dynamic import lazy + IndexedDB cache; progreso visible; "cancelar" disponible |
| Presión de memoria en sesiones grandes (>200 platos) | Medium | Embedding en lotes; >500 títulos warn + cap suave |
| Calidad pobre en títulos cortos/mixtos ES-EN | Medium | Modelo multilingüe; bucket de ruido DBSCAN para no forzar clusters falsos |
| Model loading bloquea main thread | Medium | Usar Web Worker para inference; UI responsive durante análisis |
| `@xenova/transformers` conflicto con Next 16 bundling | Low | Dynamic import server-gated (`ssr: false`); validar en design |

## Rollback Plan

1. `DROP TABLE topic_clusters;` (additive only)
2. Git-revert `lib/topicClusters.ts`, `TopicHeatmap.tsx`, `app/page.tsx`, `lib/types.ts`, `package.json`, migration
3. Sin datos migrados: los títulos en `projects` quedan intactos; ningún plato afectado

**NO commits / push / PRs hasta que el usuario apruebe.**

## Dependencies

- `@xenova/transformers` (npm) + modelo `all-MiniLM-L6-v2` (~80MB, descarga bajo demanda desde HF CDN)
- Supabase PostgreSQL — migración `003` y tabla `topic_clusters`
- Estado post-merge `host-delegable` + `profiles-global` (`useHostManager`, sesión con `email`/`profileId`, tabla `projects.session_id`)
- 16GB RAM disponibles en la laptop del usuario (suficiente para inference en browser)

## Success Criteria

- [ ] Host clickea "🔥 Analizar temas" → tras warmup del modelo ve lista de "temas calientes" con contador y ejemplos (`Fix AOD` + `Integración con AOD` en mismo cluster)
- [ ] Nombres de producto (`CLAIMS.AI`, `RulesLAB`) aparecen como clusters unitarios (no se agrupan falsamente)
- [ ] CERO embeddings salen del navegador (verificar network: solo query Supabase + recursos del modelo CDN)
- [ ] Segunda ejecución reutiliza modelo cacheado (sin re-descargar 80MB, IndexedDB hit)
- [ ] Non-host no ve el botón "🔥 Analizar temas"
- [ ] `npm test` / `tsc --noEmit` / `lint` pasan; NO commits/PRs hasta aprobación del usuario