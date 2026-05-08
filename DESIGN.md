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
| `parent_id` | uuid | Referencia al plato original (clonado) |
| `version` | int | Incremental por cada clonado Lunes-Viernes |

## 5. Implementación Visual (DishCard)
- **Bordes:** 2px por defecto, 4px si `temp >= 80`.
- **Rounded:** `rounded-xl`.
- **Tipografía:** `Inter` o `Roboto Mono` (estilo ticket de cocina).
- **Interacción:** `cursor-pointer` con `scale-105` al hacer hover.

## 6. Seguridad e Identidad (Host)
- **Host Role:** Identificado mediante el email `admin@kitchensync.com` (o `NEXT_PUBLIC_HOST_EMAIL`).
- **Restricción:** Solo el Host puede ver e interactuar con los controles de gestión de sesiones (Iniciar Lunes / Cerrar Viernes) en el `MasterKitchenView`.

## 7. Infraestructura de Testing (TDD)
- **Suite:** Vitest + React Testing Library + JSDOM.
- **Comando:** `npm test` para ejecución de suite completa.
- **Configuración:** Integrado en un entorno Next.js 16 para asegurar regresiones en la lógica de clonado y timers.

## 8. Ciclo de Vida: Lunes a Viernes
- **Monday Cloning:** Al iniciar la sesión del lunes, se clonan los platos de la sesión anterior.
  - Se mantiene la trazabilidad mediante `parent_id`.
  - Se incrementa el campo `version`.
- **Friday Closure:** Las sesiones se marcan como `closed`, congelando el estado para la posteridad.

## 9. Dinámica de Evaluación (Timer Dual)
El timer de evaluación consta de dos fases automáticas:
1. **Charla Personal (30s):** Fomento de bonding grupal con estética cálida.
2. **Evaluación (120s):** Revisión técnica con estética industrial estándar.

## 10. Plan de Desarrollo (Fases)

### Fase A: Core UI (Chef View) - COMPLETADA
1. Configurar `tailwind.config.js` con los colores `kitchen-`.
2. Crear `DishCard.tsx` aplicando condicionales de clase basados en `temp`.
3. Implementar formulario de creación de proyectos.

### Fase B: Tiempo Real y Gamificación - COMPLETADA
1. Integrar `Supabase Realtime` para sincronización automática.
2. Implementar `KitchenTimer.tsx` con evento de audio.
3. Aplicar cursores personalizados mediante CSS global.

### Fase C: Vista Host (El Maître) - COMPLETADA
1. Crear `MasterKitchenView` con navegación tipo "Miro".
2. Renderizar estaciones de trabajo dinámicas por `chef_id`.
3. Integrar sistema de "Rescate" visual para tarjetas críticas.

### Fase D: Versionado y Seguridad (Session Versioning System) - COMPLETADA
1. Implementar infraestructura de testing (Vitest).
2. Lógica de clonado de platos con trazabilidad de versiones.
3. Protección de controles administrativos basada en email de Host.
4. Timer dual para fases de charla y evaluación.

## 11. Flujo de Usuario (UX)
1. **Mise en Place:** Todos actualizan sus tableros (5 min).
2. **El Pase:** El Host inicia timer. El equipo sincroniza prioridades (2 min).
3. **Campana:** Fin de la etapa de "cocina", comienza la revisión.
4. **Degustación:** Host revisa estaciones; los Chefs justifican sus prioridades.