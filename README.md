# Instituto Tecnológico Nacional de México
## Campus Pachuca

**Desarrollo de soluciones en ambientes virtuales**

**Práctica 1.4 — Escenarios interactivos**

| | |
|---|---|
| **Docente** | Ing. Víctor Manuel Pinedo Fernández |
| **Alumna** | Manzano Luna Claudia Melissa |
| **No. de control** | 23200168 |
| **Fecha de entrega** | 15/09/2026 |

---

## Descripción

Escenario 3D interactivo en primera persona construido con **Three.js** y física real con **Rapier**. El jugador recorre un pasillo de nave espacial (`space_ship_hallway.glb`) con colisiones de mundo estático (Octree + Capsule) y puede empujar o disparar cajas dinámicas con masas distintas mediante un láser tipo bala neón.

## Tecnologías

- [Three.js](https://threejs.org/) `0.180.0` (renderer, cámara, luces, `GLTFLoader`, `Octree`, `Capsule`)
- [Rapier3D](https://rapier.rs/) (`@dimforge/rapier3d-compat`) para el mundo físico, cuerpos rígidos y colliders
- Bootstrap 5.3 (HUD y estilos base)

## Estructura del proyecto

```
threejs-interactive-scenario/
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── js/main.js
│   └── models/
│       ├── space_ship_hallway.glb   (escenario activo)
│       └── collision-world.glb      (escenario alternativo, sin usar)
├── sounds/
└── textures/
```

## Controles

| Tecla / acción | Efecto |
|---|---|
| `WASD` | Mover al jugador |
| `SPACE` | Saltar (solo si está en el suelo) |
| Mouse | Mirar alrededor (requiere Pointer Lock) |
| Clic izquierdo | Disparar láser |
| Clic sobre el escenario | Activar Pointer Lock |
| `ESC` | Liberar el mouse |

## Cómo ejecutar

El proyecto usa módulos ES (`<script type="module">`) e import maps, por lo que debe servirse por HTTP, no abrirse como archivo local:

```bash
python -m http.server 8123
```

Y abrir `http://localhost:8123` en el navegador.

## Historial de versiones

- **v0.1** — Estructura del proyecto y descarga del modelo del escenario.
- **v0.2** — Configuración de `Scene`, `PerspectiveCamera`, `WebGLRenderer`, Pointer Lock (con feedback visual de estado) y ajuste responsive.
- **v0.3** — Integración del escenario GLTF, `Octree`, `Capsule`, gravedad, salto, iluminación y sombras (frustum de sombras y submuestreo de colisión por frame).
- **v0.4** — Mundo físico de Rapier, piso físico independiente del modelo y objetos 3D dinámicos con masas distintas.
- **v0.5** — Sincronización Mesh/RigidBody, fricción y restitución consistentes en todos los colliders, CCD y amortiguación angular.
- **v0.6** — Empuje del jugador y disparo láser mediante `applyImpulse()`, con estética de bala neón roja.
