# Ritmo 2.3: estadísticas y Focus persistente

## Estado y alcance

El código incorpora un registro autoritativo de Focus y estadísticas semanales/mensuales.
No es una certificación de ejecución: en este entorno se aprobaron pruebas frontend,
funciones puras Python y el build; PostgreSQL temporal, restauración y navegador real
siguen pendientes porque Docker no es accesible. No se ejecutó la migración principal.

`005_focus.sql` añade `focus_sessions`, `focus_segments` y `focus_requests`, sin modificar
migraciones anteriores ni actualizar hábitos/tareas existentes. Solo se añade `tzdata`
para disponer de zonas IANA incluso si la imagen no incluye la base de zonas del SO.
Revisar y actualizar esa base de reglas al distribuir el producto.

## Modelo y exactitud temporal

Una sesión tiene propietario obligatorio, tarea propia opcional, inicio/finalización,
fecha de creación, duración elegida, duración activa acumulada, estado y versión. Los
estados son `running`, `paused`, `completed` y `cancelled`; estos dos últimos se presentan
como completada e interrumpida. Eliminar una tarea conserva Focus y deja su vínculo en null.

Cada inicio/reanudación abre un segmento. Pausar, finalizar o cancelar lo cierra y acumula
su tiempo en una transacción. Las pausas no aportan minutos. Se usa `clock_timestamp()`
de PostgreSQL; los cálculos de diferencias se hacen en UTC con precisión de milisegundos.
El cliente no puede proporcionar duración real, marcas temporales ni propietario.

La duración elegida admite de 60 a 14400 segundos (1–240 minutos). Un segmento se recorta
al tiempo que resta para esa duración: abandonar la pestaña durante una noche no genera
horas adicionales. Al alcanzar el límite, el servidor puede calcular el tiempo exacto
sin ticks del navegador, pero **no completa la sesión automáticamente**: permanece activa
hasta que se confirme Finalizar o Cancelar. La UI permite hacerlo también al recuperar
la sesión. Una sesión en curso o pausada no contribuye a las estadísticas, ni siquiera
por sus segmentos ya cerrados.

La finalización/cancelación es la confirmación necesaria para agregar minutos. Las
completadas y las interrumpidas tienen sumas separadas; el total Focus incluye ambas.
`ended_at` representa cuándo se confirmó el cierre. Los minutos se atribuyen a las fechas
reales de los segmentos, que pueden ser anteriores a esa confirmación. Completar antes
del objetivo registra únicamente lo transcurrido, nunca la duración planeada.

## Duplicados, concurrencia y recuperación

- Cada escritura exige UUID de petición. Su alcance es la cuenta, no un identificador
  compartido entre usuarios. El servidor guarda operación, sesión y cuerpo normalizado.
- Repetir la misma petición devuelve el estado actual sin aplicar de nuevo la transición.
  Cambiar el cuerpo u operación reutilizando la clave devuelve `409`. Una sesión retirada
  no se revive por un reintento de inicio; ese acceso devuelve `404`.
- Un índice único parcial permite una sola sesión en curso/pausada por cuenta. Además,
  un bloqueo de cuenta serializa inicios y comandos entre procesos.
- Las acciones posteriores al inicio exigen `expected_version`. Una versión obsoleta
  devuelve `409`; la UI debe actualizar y no sobrescribir un cambio de otra pestaña.
- Tras un corte sin respuesta, la UI conserva en memoria la petición exacta para un
  reintento explícito con la misma clave. Los errores HTTP definitivos descartan ese
  reintento y requieren actualizar estado antes de seguir.
- Al recargar no se crea otra sesión: primero se consulta `/focus/active`. La restricción
  del servidor también protege frente a inicios concurrentes. No se persiste una cola
  offline ni se guardan tokens/credenciales en almacenamiento web.
- Se reconcilia al recuperar visibilidad/foco y cada 30 segundos. `setInterval` solo
  repinta una estimación basada en la última consulta; no crea minutos ni finalizaciones.

Los registros de idempotencia se conservan con las sesiones. Se necesita una política de
retención antes de una distribución a gran escala. No hay sincronización offline todavía.

## API

Todas las rutas reutilizan la cookie de sesión y aplican el propietario en las consultas.
Los cuerpos rechazan campos desconocidos. Una relación con tarea ajena devuelve `404`.

| Método y ruta | Contrato |
| --- | --- |
| `GET /api/focus/active` | `{session, server_time}`; session es null si no hay una activa. |
| `POST /api/focus` | `{request_id, planned_seconds, task_id?}`; crea o recupera el mismo inicio. |
| `GET /api/focus/{id}` | Estado propio y tiempo activo calculado en el servidor. |
| `POST /api/focus/{id}/pause` | `{request_id, expected_version}`. |
| `POST /api/focus/{id}/resume` | Mismo contrato; no reanuda si ya se agotó el tiempo elegido. |
| `POST /api/focus/{id}/finish` | Confirma cierre completado. |
| `POST /api/focus/{id}/cancel` | Confirma cierre interrumpido. |
| `PATCH /api/focus/{id}` | `{request_id, expected_version, task_id}`; cambia o quita el vínculo. |
| `DELETE /api/focus/{id}?request_id=UUID&expected_version=N` | Retira del historial solo una sesión terminal; `204`. |
| `GET /api/focus?start=…&end=…&timezone=…&limit=50&offset=0` | Historial paginado que intersecta el periodo. |
| `GET /api/statistics?start=…&end=…&timezone=…` | Métricas, serie diaria, categorías e historial/rachas de hábitos. |

La retirada es lógica (`deleted_at`): conserva segmentos y claves de petición, pero excluye
la sesión del historial visible y estadísticas. Puede cambiar los totales de informes
anteriores. No se retiran sesiones activas: primero se deben finalizar o cancelar.

Las lecturas incluyen `Cache-Control: no-store`. Intervalos inclusivos de 1 a 31 días,
zona IANA de hasta 64 caracteres y paginación de 1–100 elementos. Límites de fecha que
impiden construir medianoche exclusiva o convertir a UTC se rechazan con `422`, incluido
9999-12-31. Un informe admite hasta 1000 hábitos y 10000 segmentos; un exceso produce
`413`, nunca un resultado truncado presentado como completo.

## Definiciones de las estadísticas

No hay una única «fecha de actividad» para todos los datos. La UI y los gráficos usan:

- **Tareas:** cohorte con `due_date` dentro del periodo. Total, completadas y porcentaje
  reflejan su estado **actual**. Vencidas son las pendientes con vencimiento anterior a
  hoy en la zona seleccionada. Sin fecha no se incluyen. No se reconstruye cómo estaba
  una tarea antes de reabrirla o editarla; `completed_at` no es un diario de transiciones.
- **Hábitos:** conjunto de hábitos actuales de la cuenta. Cada fecha del periodo hasta
  hoy es una oportunidad por hábito. Los días futuros no se penalizan. La aplicación
  anterior no guardaba fecha de alta; no se inventa una ni se afirma que ese denominador
  sea un registro histórico del conjunto de hábitos que existía entonces. Borrar un
  hábito también borra sus marcas según el contrato anterior, y afecta estos informes.
- **Rachas de hábitos:** se calculan **dentro del periodo** y hasta min(fin, hoy). La
  racha actual termina en esa fecha; si es hoy y aún no está marcado, puede continuar
  desde ayer. La máxima es la secuencia más larga del periodo, no un récord global.
  El historial diario distingue cumplido, pendiente y futuro no evaluado.
- **Planeado:** suma de duraciones de bloques por fecha local y categoría. Los bloques
  solapados suman ambos; no representa horas únicas ni productividad efectiva.
- **Focus:** solo sesiones terminales confirmadas y no retiradas. Segmentos activos
  intersectados con cada día local del periodo, separados entre completadas/interrumpidas.
  La suma incluye fracciones de minuto; la interfaz redondea solo la presentación.
- **Número de sesiones:** cuenta por fecha de cierre confirmada (`ended_at`) en el periodo,
  mientras que los minutos se reparten por segmento. Una sesión puede aportar minutos a
  un periodo distinto del que contiene la confirmación de su cierre.

Los informes usan una transacción de lectura consistente y seis consultas de conjuntos,
no una por hábito, día o sesión. La serie diaria incluye días sin actividad con ceros
obtenidos del resultado confirmado; un error no se transforma en un informe vacío.

## Zonas horarias

Fechas de tareas/hábitos y horarios de bloques siguen siendo fechas/horas locales flotantes
del modelo existente; cambiar la zona no los desplaza. Instantes Focus se almacenan como
`timestamptz`. El informe usa la zona IANA elegida (por omisión, la del navegador; API UTC)
para medianoches y el cálculo de hoy, dividiendo los segmentos en UTC. Esto contempla días
locales de 23 o 25 horas por cambios de horario. Se añadió una dependencia de reglas IANA,
no un desplazamiento fijo como UTC-6.

La zona no es aún una preferencia persistida por cuenta. Dos dispositivos deben escoger
la misma para comparar informes. El tiempo de Focus no prueba atención humana: si el
usuario no pausa, el servidor cuenta tiempo corrido hasta el límite elegido.

## Frontend y continuidad

`useFocusSession` coordina recuperación, versiones y reintentos. `focusService` construye
peticiones; `displayElapsed` es lógica pura. `FocusTimer` conserva la tarjeta y duración,
añadiendo vínculo opcional, Finalizar, Cancelar y Actualizar. Ya no hay un reinicio local
que borre silenciosamente una sesión: cancelar la registra como interrumpida y un nuevo
inicio crea otra. El selector muestra hasta las primeras 100 tareas; no afirma listar
una biblioteca ilimitada. El hook y los servicios pueden recibir otros adaptadores de
transporte en una futura app, sin depender de Docker ni de un intervalo para contabilizar.

`StatisticsPanel` utiliza filtros, tarjetas, gráficos de barras accesibles, actividad
por día, rachas y un historial paginado. No se instalaron librerías gráficas o runtimes
nativos. Los modales y todos los módulos anteriores se conservan.

## Pruebas y ejecución exclusivamente temporal

```sh
npm --prefix frontend test
npm --prefix frontend run build
python3 -B -m unittest discover -s tests -p 'test_metrics.py'
```

Resultado local: **56 pruebas frontend y 10 pruebas puras Python aprobadas**, build con
TypeScript correcto y sintaxis Python/shell/Compose comprobada. Las pruebas puras no
importan la API, no abren conexiones y no sustituyen la integración PostgreSQL.

Hay 24 nuevos casos PostgreSQL preparados: transiciones, pausas, tiempo exacto, recuperación,
reintentos, concurrencia, versiones, pertenencia, validación, edición, retirada lógica,
relación con tareas, agregaciones, medianoche local e intervalos. **No se ejecutaron**:
Docker devuelve `permission denied` en el entorno de implementación. Tampoco se verificó
un navegador real ni se ejecutó la nueva migración o el recorrido de respaldo/restauración.

El arranque de FastAPI aplica migraciones pendientes: **no arrancar ni reconstruir la API
principal para esta verificación**. Desde la raíz, con Docker disponible y solo datos
sintéticos, ejecutar cada paso únicamente si el anterior terminó con código 0:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml stop api-preview
docker compose -f compose.test.yaml build tests
docker compose -f compose.test.yaml up -d --wait db-test
docker compose -f compose.test.yaml run --rm --no-deps tests
docker compose -f compose.test.yaml run --rm --no-deps backup-check
```

No detener `db-test` entre pasos: usa tmpfs. El respaldo incluye las diez tablas actuales,
con Focus, segmentos, peticiones y secuencias. Para revisión en navegador (puerto libre;
5180 por omisión):

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

Abrir `http://127.0.0.1:5180`, crear una cuenta de prueba e iniciar Focus; pausar, recargar,
reanudar y finalizar. Comprobar recuperación, una sola sesión activa, historial y métricas.
Probar otra sesión cancelada, otra cuenta, periodos con futuro y zonas distintas. En pruebas
se acelera el reloj mediante monkeypatch; producción no acepta ese control desde el cliente.
El mantenimiento del reloj, las reglas IANA y los conflictos de red deben verificarse en
el despliegue real antes de habilitarlo sobre cuentas existentes.
