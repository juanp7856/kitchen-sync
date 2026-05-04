# KitchenSync: Diseño del Sistema

## 1. Visión
KitchenSync es una herramienta de sincronización de proyectos en tiempo real basada en la metáfora de una **Cocina Profesional**. El objetivo es reducir la fricción de los reportes de estatus y fomentar la colaboración mediante el rescate mutuo de proyectos mediante una dinámica gamificada.

## 2. Metáfora Gastronómica y UI (Paleta de Colores)
Los colores definen el estado crítico del "Plato" (Proyecto):

| Temperatura | Color (Tailwind) | HEX | Uso |
| :--- | :--- | :--- | :--- |
| **Frío (0-39°C)** | `kitchen-cool` | `#3B82F6` | Proyecto en control |
| **Templado (40-79°C)** | `kitchen-warm` | `#F59E0B` | Precaución |
| **Crítico (80-100°C)** | `kitchen-hot` | `#EF4444` | Bloqueo/Emergencia (pulsante) |
| **Servido (Finalizado)** | `kitchen-done` | `#10B981` | Proyecto completado |
| **Estilo (Fondo)** | `kitchen-steel` | `#1F2937` | UI Estética Industrial |

## 3. Dinámica de Gamificación
- **Timer de Cocina:** Cronómetro de 2 minutos que dispara un sonido `kitchen-bell.mp3` al finalizar.
- **Cursores Custom:** Cuchillo para el Host (`chef-knife.svg`), mano de chef para usuarios (`chef-hand.svg`).
- **Vista Global (Host):** Panel tipo "Miro" con zoom/pan (`react-zoom-pan-pinch`).
- **Rescate (Alerta):** Acción especial para solicitar ayuda que aplica animación `animate-pulse` y borde de 4px en la tarjeta.

## 4. Estructura de Datos (Supabase `public.projects`)
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | uuid | PK |
| `title` | text | Nombre del proyecto |
| `status` | text | prep, slow, served |
| `temp` | int | 0-100 (determina color) |
| `chef_id` | text | ID del usuario dueño |

## 5. Implementación Visual (DishCard)
- **Bordes:** 2px por defecto, 4px si `temp >= 80`.
- **Rounded:** `rounded-xl`.
- **Tipografía:** `Inter` o `Roboto Mono` (estilo ticket de cocina).
- **Interacción:** `cursor-pointer` con `scale-105` al hacer hover.

## 6. Plan de Desarrollo (Fases)

### Fase A: Core UI (Chef View)
1. Configurar `tailwind.config.js` con los colores `kitchen-`.
2. Crear `DishCard.tsx` aplicando condicionales de clase basados en `temp`.
3. Implementar formulario de creación de proyectos.

### Fase B: Tiempo Real y Gamificación
1. Integrar `Supabase Realtime` para sincronización automática.
2. Implementar `KitchenTimer.tsx` con evento de audio.
3. Aplicar cursores personalizados mediante CSS global.

### Fase C: Vista Host (El Maître)
1. Crear `MasterKitchenView` con navegación tipo "Miro".
2. Renderizar estaciones de trabajo dinámicas por `chef_id`.
3. Integrar sistema de "Rescate" visual para tarjetas críticas.

## 7. Flujo de Usuario (UX)
1. **Mise en Place:** Todos actualizan sus tableros (5 min).
2. **El Pase:** El Host inicia timer. El equipo sincroniza prioridades (2 min).
3. **Campana:** Fin de la etapa de "cocina", comienza la revisión.
4. **Degustación:** Host revisa estaciones; los Chefs justifican sus prioridades.