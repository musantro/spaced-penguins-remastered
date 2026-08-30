# API de testing de Director

Esta API convierte Macromedia Director 8 en un oráculo de pruebas reproducible
sin ejecutar código vintage en el host. Las consultas de inventario leen los
artefactos ya extraídos; cada ejecución crea una película de trabajo nueva y la
abre dentro de un Windows Sandbox desechable, sin red, portapapeles del host,
cámaras, micrófono ni impresoras.

## Consultas de assets, pantallas y niveles

```text
pnpm reference:assets -- --type bitmap
pnpm reference:assets -- --cast Internal --name ship
pnpm reference:screens
pnpm reference:levels
```

`assets` devuelve cast, número, tipo, nombre, punto de registro y los ficheros
extraídos. `levels` refleja la relación verificada nivel 1 → frame 11 hasta
nivel 25 → frame 35. Los frames 36–49 atraviesan el script de loop, pero la
matriz de Director demuestra que no contienen el comportamiento GPS y no son
niveles jugables. `screens` combina las transiciones confirmadas por Lingo con
`the labelList` que Director escribe durante la ejecución más reciente.

Para verificar de una vez todo el contenido ejecutable:

```text
pnpm reference:verify-all
```

El comando reutiliza una única VM desechable, pero llama a `prepareMovie` antes
de cada objetivo para que no se filtre estado. En los 25 niveles ejecuta un
lanzamiento real y exige dos muestras, velocidad válida, nivel lógico correcto
y captura 500×400. Antes de cada PNG eleva el contenedor nativo del Stage y
rechaza la captura si Score, Cast u otra ventana del IDE sigue solapándolo. En
las siete pantallas verifica el marker, captura el Stage
antes de Play y vuelve a capturarlo después de ejecutar. `Load` se caracteriza
explícitamente como una transición de `Load` a `Intro`.

También se puede importar la API desde Node:

```js
import {
  createPhysicsRequest,
  listAssets,
  runReferenceRequest,
} from "./tools/reference/test-api/index.mjs";
```

## Física

La forma polar es la más sencilla:

```text
pnpm reference:physics -- --id tiro-01 --level 1 --distance 100 --angle -137 --frames 120
```

También se puede pedir un vector de velocidad inicial:

```text
pnpm reference:physics -- --id tiro-vector --level 1 --vx -20 --vy -18 --frames 120
```

Las coordenadas son las de Director: `(0, 0)` está arriba a la izquierda, `x`
crece hacia la derecha, `y` hacia abajo, 0 grados apunta a la derecha y 90
grados hacia abajo. `distance` es la distancia de estiramiento del tirachinas;
se limita primero al intervalo de la API y después al `pStretchLimit` real del
nivel. Un vector no puede superar la velocidad máxima original de 40.

El comando crea `reference/test-api/runs/<id>/` (ignorado por Git) con:

- `request.json`: entrada exacta;
- `raw-trace.tsv`: valores escritos por Director en cada límite observable;
- `trace.json`: versión normalizada para tests;
- `result.json`: metadatos de ejecución;
- `movie-labels.txt`: etiquetas que expone la película;
- capturas de Stage de 500×400 si se solicitaron.

Cada muestra contiene frame/etiqueta, estado GPS, posición, velocidad,
distancia, intentos, nivel, score, límites del Stage, planetas y sus órbitas,
zonas gravitatorias activas, contactos, nave y estado/valor de cada bonus.
`trace.json.events` reduce los cambios a eventos de estado, colisiones y
recogida de gadgets.

El ejemplo versionado se puede ejecutar directamente:

```text
pnpm reference:test-api -- run reference/scenarios/002-physics-api-example.json
```

## Pantallas, frames y snapshots

```text
pnpm reference:state -- --id intro --label Intro --frames 0 --screenshots 0
pnpm reference:state -- --id nivel-8 --level 8 --frames 1 --screenshots 1
pnpm reference:state -- --id frame-52 --frame 52 --frames 0 --screenshots 0
```

La última muestra de cada traza incluye un `snapshot`. Puede guardarse como
JSON y pasarse mediante `--snapshot` para restaurar frame, score, alerta, GPS,
planetas orbitales y bonus antes de continuar:

```text
pnpm reference:state -- --id replay --level 1 --snapshot snapshot.json --frames 30
```

La reproducción se hace desde una sesión limpia y no depende de conservar una
VM. El snapshot cubre el estado observable necesario para física y gameplay;
campos futuros se añadirán versionando el esquema, nunca reinterpretando una
captura antigua.

Las capturas se disparan al observar que la traza ha alcanzado la muestra
pedida. `result.json` conserva tanto `requestedSample` como `observedSample`;
solo una igualdad entre ambos es válida como golden de píxeles. Las trazas
numéricas, en cambio, se escriben dentro del handler de Director y tienen
exactamente una muestra por límite de frame. El punto observado es el
`prepareFrame` del movie script de referencia, que la traza nativa sitúa justo
después del `prepareFrame` de GPS. El `go(the frame)` de `Game_Looping` corta la
propagación posterior de `exitFrame`, una peculiaridad que la API conserva.

## Contrato y seguridad

Los contratos formales están en
`reference/test-api/schemas/request.schema.json` y
`reference/test-api/schemas/trace.schema.json`. El runner rechaza niveles,
estados, símbolos y rutas fuera del ámbito permitido. Originales, película
instrumentada, trazas y capturas continúan fuera de Git.

Antes de la primera ejecución hacen falta `pnpm reference:prepare` y
`pnpm reference:authoring`, que preparan el DIR reconstruido y la caché
verificada de Director 8 dentro del Sandbox. Nunca se debe abrir
`Spaced_Penguin.exe` ni `Director.exe` directamente en el host.

El guest publica `result.json` mediante un rename atómico. El host sólo inicia
el cierre después de verlo completo, solicita el cierre normal de la ventana y
acepta automáticamente el aviso de descarte; los diálogos de error o feedback
se cierran sin enviar información. Sólo cuando la interfaz ya ha desaparecido
se elimina un posible proceso residual sin ventana. Los fallos transitorios de
inicialización se reintentan hasta tres veces, pero un error de Director o de
una comprobación se devuelve inmediatamente y no se oculta.
