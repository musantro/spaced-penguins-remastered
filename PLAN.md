# Plan de trabajo

## Estado actual

Estamos al final de la preparación técnica, pero el port para navegador todavía
no ha comenzado. Ya disponemos de:

- el original canónico preservado, identificado mediante hashes y decompilado;
- los scripts, bytecode, textos, bitmaps, vectores, audio y metadatos extraídos;
- una ejecución aislada y reproducible del proyector original;
- un escenario visual conocido del nivel 1 que termina con distancia 318 y
  puntuación 318;
- Director 8 ejecutando la película reconstruida dentro de Windows Sandbox;
- trazas nativas de handlers, sentencias y valores calculados por Lingo;
- acceso automatizable a los comandos del depurador de Director;
- una API estructurada que inventaría assets, pantallas y niveles, lanza por
  distancia/ángulo o vector, devuelve trayectoria, colisiones y gadgets, y
  restaura snapshots dentro de Windows Sandbox;
- una matriz ejecutada en Director que confirma los 25 niveles jugables y las
  siete pantallas, con lanzamiento y captura 500×400 por nivel;
- una arquitectura objetivo basada en TypeScript, Canvas 2D, Web Audio, Vite,
  Vitest y Playwright.

La secuencia crítica restante es:

```text
matriz de caracterización y audio
→ inventario completo
→ runtime determinista
→ nivel 1 verificado
→ resto del juego
→ conformidad multinavegador
→ publicación
```

## 1. Cerrar el oráculo de referencia

Este laboratorio ya está operativo; quedan por ampliar sus escenarios antes de
programar el port.

1. [x] Crear comandos específicos `reference:physics` y `reference:state`.
2. [x] Abrir automáticamente la película instrumentada en Director 8 dentro del
   Sandbox.
3. [x] Localizar estructuralmente el área exacta de 500 por 400 del Stage, sin
   depender de capturas de pantalla.
4. [x] Reproducir exactamente el escenario conocido:
   - pulsar Start;
   - arrastrar a Kevin de `(413, 303)` a `(469, 355)`;
   - respetar los tiempos de pulsación y liberación;
   - ejecutar unos 120 fotogramas a 30 fps.
5. [x] Registrar sin pausas, fotograma por fotograma:
   - estado del juego;
   - `pPoint`;
   - `pVX` y `pVY`;
   - posición de Kevin;
   - posiciones de los planetas;
   - estado y resultado de las colisiones;
   - intento actual;
   - distancia;
   - puntuación;
   - alertas y transiciones.
6. [x] Normalizar la salida de Director a JSON estable.
7. [x] Comparar esa traza con el proyector sin modificar:
   - llegada a la nave en el mismo fotograma;
   - distancia final 318;
   - puntuación 318;
   - mismas posiciones visibles en fotogramas seleccionados.
8. Caracterizar los eventos de sonido: muestra, inicio, parada, bucle y
   fotograma.
9. Usar la traza nativa completa solamente alrededor de puntos dudosos, para
   evitar ralentizar la película.
10. Automatizar breakpoints en una línea concreta solo si una discrepancia no
    puede resolverse con las trazas. Ya conocemos los comandos del depurador,
    pero todavía no está implementada la selección automática de script, línea
    y posición del cursor.

Condición de salida: un input conocido produce una trayectoria numérica
completa y reproducible, respaldada por el Director original y por las capturas
del proyector.

## 2. Construir la matriz de experimentos

Una trayectoria demostrará que el laboratorio funciona, pero no caracteriza
todo Director ni todo el juego. Hay que capturar escenarios pequeños y
deliberados:

1. Estiramiento mínimo, medio y máximo.
2. Lanzamientos horizontales, verticales y diagonales.
3. Influencia de cero, uno y varios planetas.
4. Rozar, golpear y fallar por muy poco un planeta.
5. Entrar en la nave por el centro y por sus bordes.
6. Salir y volver a entrar en el Stage.
7. Salir del rectángulo exterior permitido.
8. Planetas estáticos y orbitando.
9. Lanzamientos en diferentes fotogramas de la órbita.
10. Colisiones con bonus en sus límites.
11. Rebote, accidente y timeout.
12. Cálculo de distancia, puntuación, nivel e intentos.
13. Aleatoriedad y secuencias de animación.
14. Todas las transiciones de menús, instrucciones, alertas y final.

Cada experimento tendrá input, estado inicial, resultado original, hashes y
fotogramas relevantes. Ningún resultado esperado se calculará mediante el
futuro port.

Condición de salida: todos los comportamientos que puedan afectar al estado,
la presentación o el resultado de una partida tienen una caracterización
independiente del port.

## 3. Completar el inventario del juego

La extracción está hecha, pero falta transformar lo recuperado en una
descripción completa y revisada del juego.

1. Decodificar todo el Score y la timeline de Director:
   - etiquetas de fotograma;
   - cambios de tempo;
   - rangos de sprites;
   - scripts asociados;
   - eventos por fotograma;
   - navegación entre pantallas.
2. Inventariar los 110 miembros del cast interno y los casts de scripts y
   textos.
3. Documentar cada nivel:
   - posiciones iniciales;
   - planetas;
   - radios y zonas gravitatorias;
   - nave;
   - bonus;
   - intentos;
   - parámetros especiales;
   - planetas móviles u orbitando.
4. Documentar cada sprite:
   - canal y orden de dibujo;
   - punto de registro;
   - posición;
   - escala;
   - rotación;
   - tinta y transparencia;
   - animación;
   - comportamiento asociado.
5. Catalogar todos los bitmaps, vectores, sonidos y textos.
6. Convertir los miembros vectoriales y SWF a assets deterministas para
   Canvas, conservando el original y su hash.
7. Identificar fuentes, tamaños, métricas, colores y paletas.
8. Reconstruir textos respetando saltos, alineación y posibles errores
   originales.
9. Catalogar todos los enlaces externos y recuperar, cuando sea posible, su
   destino histórico desde archivos web.
10. Crear un informe de cobertura que permita comprobar que no falta ningún
    miembro o rama.

Condición de salida: cualquier pantalla o nivel puede reconstruirse
exclusivamente desde datos inventariados, sin colocar elementos a ojo.

## 4. Preparar el proyecto web

La tecnología objetivo será:

- TypeScript;
- Canvas 2D;
- Web Audio;
- Vite;
- Vitest;
- Playwright;
- sin React ni emulador en el producto final.

Hay que crear:

1. Configuración de TypeScript, Vite, Vitest y Playwright.
2. Estructura de módulos:
   - `core`;
   - `director-compat`;
   - `content`;
   - `render`;
   - `audio`;
   - `input`;
   - `shell`.
3. Bucle determinista fijo a 30 fps.
4. Función pura equivalente a `tick(input): FrameSnapshot`.
5. Reproductor de inputs grabados.
6. Serializador de trazas del port con el mismo esquema que Director.
7. Comparador automático de trazas.
8. Comparador de imágenes de 500 por 400.
9. Registro comprobable de eventos de audio.
10. Canvas lógico fijo de 500 por 400 con escalado uniforme y sin alterar
    coordenadas.

Condición de salida: la simulación puede avanzarse en tests sin navegador ni
reloj real, y el navegador se limita a ejecutar y presentar esa misma
simulación.

## 5. Caracterizar las peculiaridades de Director 8

Antes de usarlas en el juego, habrá que reproducir y probar:

1. Precisión y redondeo numérico de Lingo.
2. Comportamiento de `point`.
3. Conversión entre enteros, floats y coordenadas de sprites.
4. Rectángulos e intersecciones.
5. Orden exacto de handlers:
   - `prepareFrame`;
   - `enterFrame`;
   - comportamientos de sprites;
   - `exitFrame`.
6. Orden de aplicación de gravedad.
7. Actualización de posición y velocidad.
8. Orden de los planetas.
9. Semántica de sprites invisibles o vacíos.
10. Límites del Stage.
11. Generador aleatorio.
12. Avance del Score y cambios de fotograma.

Cada regla de `director-compat` necesitará una traza o experimento
independiente que la justifique.

Condición de salida: las compatibilidades empleadas por el primer nivel están
implementadas y respaldadas por evidencia del runtime original.

## 6. Hacer el primer nivel completo

Este será el primer vertical slice del port.

1. Cargar los assets originales del nivel 1.
2. Crear su estado inicial desde datos.
3. Implementar el tirachinas y la cuantización del input.
4. Implementar lanzamiento, gravedad y movimiento.
5. Implementar colisiones con planetas y nave.
6. Implementar distancia, intentos y puntuación.
7. Implementar animaciones, estela, flecha y sonidos necesarios.
8. Renderizarlo exactamente a 500 por 400.
9. Reproducir el input del escenario de referencia.
10. Comparar cada fotograma numérico.
11. Comparar capturas en fotogramas estables.
12. Comparar eventos de audio.
13. Corregir las diferencias hasta que el nivel pase completamente.

Condición de salida: el escenario canónico pasa las comparaciones de física,
eventos, capturas y audio. Este paso prueba que la metodología completa
funciona.

## 7. Portar el resto del juego

Después se avanzará nivel por nivel y pantalla por pantalla:

1. Todos los niveles y configuraciones planetarias.
2. Planetas móviles y orbitando.
3. Bonus y sus animaciones.
4. Rebotes, accidentes y timeouts.
5. Estela de Kevin y flecha fuera de pantalla.
6. Distancia, puntuación acumulada e intentos.
7. Transiciones entre niveles.
8. Pantalla de carga.
9. Título.
10. Todas las páginas de instrucciones.
11. Alertas y confirmaciones.
12. Créditos.
13. Pantallas de victoria y final.
14. Flujo de jugar otra vez.
15. Formulario y pantalla de puntuaciones.
16. Botones, enlaces y cursores.
17. Animaciones aleatorias.
18. Todos los detalles extraños o bugs visibles del original.
19. Manejo de ratón, teclado y pointer sin cambiar las reglas originales.

Cada unidad se portará junto con su escenario de referencia; no se dejará toda
la verificación para el final.

Condición de salida: todos los elementos del inventario y todas las ramas
visibles están implementados.

## 8. Resolver los servicios y enlaces antiguos

Algunos destinos web y el backend de puntuaciones probablemente ya no
funcionan. Primero habrá que establecer exactamente qué hacía el original y
luego decidir entre:

- conservar el enlace histórico;
- abrir una copia archivada;
- mostrar fielmente el flujo y explicar que el servicio ya no existe;
- implementar un sustituto moderno, que sería una desviación explícita.

El comportamiento visible puede reproducirse fielmente, pero inventar un nuevo
servidor de puntuaciones no sería fidelidad estricta y necesitaría aprobación.

Condición de salida: cada acción externa tiene un tratamiento seguro,
documentado y aprobado.

## 9. Ejecutar la conformidad completa

1. Reproducir toda la matriz de inputs.
2. Comparar estados y física fotograma por fotograma.
3. Comparar capturas doradas de 500 por 400.
4. Comparar eventos de audio.
5. Comprobar cobertura de todos los niveles, miembros y ramas.
6. Verificar Chromium, Firefox y WebKit.
7. Probar diferentes factores de escala CSS.
8. Probar ratón, pointer y pantallas táctiles.
9. Probar desbloqueo de audio.
10. Probar pérdida de foco, pausa y reanudación.
11. Comprobar que el refresco del monitor no cambia la simulación.
12. Prerenderizar textos o vectores cuando el rasterizado del navegador impida
    una igualdad estable.
13. Documentar cualquier desviación que no pueda eliminarse.

Condición de salida: el contrato de fidelidad pasa en todos los navegadores
soportados y cualquier desviación restante está identificada y aprobada.

## 10. Empaquetar y publicar

1. Generar un build estático, sin backend necesario para la lógica del juego.
2. Añadir carga y caché de assets.
3. Mantener el marco lógico de 500 por 400 y escalarlo uniformemente.
4. Añadir metadatos y una página contenedora sin cambiar la presentación
   interna.
5. Ejecutar las pruebas en integración continua.
6. Verificar que originales, herramientas vintage y capturas no entren
   accidentalmente en Git.
7. Crear manifiestos de hashes para los assets generados.
8. Documentar la reproducción del entorno y la procedencia de los materiales.
9. Decidir las condiciones de distribución pública de los assets originales.
   El port local puede ser exacto, pero publicarlos es una cuestión separada.
10. Producir la primera versión verificable.

Condición de salida: existe una distribución web reproducible, comprobada y
sin dependencias del runtime de Director.

## 11. Dejar el repositorio en un estado sólido

Actualmente los archivos del proyecto todavía aparecen como no versionados.
Antes de que el proyecto crezca mucho más conviene:

1. Revisar `.gitignore`.
2. Confirmar que originales, capturas, DIR, DCR, instaladores y derivados
   pesados están excluidos.
3. Versionar documentación, manifiestos, escenarios, instrumentación y scripts
   reproducibles.
4. Ejecutar `reference:prepare` desde un estado limpio.
5. Crear el primer punto de restauración del proyecto.

## Siguiente acción

La siguiente tarea es obtener la trayectoria estructurada completa del
escenario del nivel 1 que termina con 318 puntos. Hasta que esto funcione,
programar la física del navegador produciría una aproximación plausible, pero
no una reproducción demostrablemente fiel.

Los documentos que desarrollan este plan son:

- `docs/PORTING_PLAN.md`: fases y decisiones del port;
- `docs/FIDELITY.md`: contrato y metodología de verificación;
- `docs/ARCHITECTURE.md`: arquitectura del runtime web.
