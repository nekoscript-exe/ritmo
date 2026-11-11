# Ritmo

**Rama de desarrollo 2.1:** incluye la migración pendiente `004_tasks.sql`. Verificarla
primero con los Compose de pruebas indicados al final. No reiniciar ni reconstruir la
API de la instalación principal sin revisar la migración y el respaldo.

Organizador personal de agenda y hábitos. En la primera versión puedes elegir una fecha, crear y eliminar bloques de horario, registrar hábitos diarios y marcar cuáles completaste ese día.

## Arquitectura

```text
Navegador → Nginx ── /       → HTML, CSS y JavaScript
                 └─ /api/  → FastAPI → PostgreSQL → volumen postgres_data
```

- **Nginx** sirve la interfaz compilada con Vite y reenvía las peticiones de la API. El navegador usa el mismo origen para ambas. Solo Nginx publica un puerto, limitado a la computadora local.
- **FastAPI** valida las peticiones y ejecuta las consultas mediante Psycopg. Los nombres de servicio de Compose permiten que Nginx encuentre a `api` y que la API encuentre a `db`.
- **PostgreSQL** guarda la lista de hábitos, sus marcas por fecha y los bloques de agenda. El volumen administrado por Docker conserva los datos al reemplazar los contenedores.
- **Docker Compose** crea la red y el volumen, construye la API y coordina el arranque. La API espera a PostgreSQL y Nginx espera a la API.

Esta versión está pensada para uso personal en la computadora local. Al entrar con tu cuenta, tus hábitos aparecen en cada fecha y la marca de cumplimiento pertenece al día elegido. Los bloques usan la hora local del navegador y comienzan y terminan en la misma fecha. Se permiten bloques superpuestos.

## Primer arranque

Ejecuta los comandos desde la carpeta que contiene `compose.yaml`. Necesitas Docker en ejecución y el complemento Docker Compose.

| Comando | Qué hace |
| --- | --- |
| `docker compose version` | Comprueba que tienes el complemento Compose. |
| `docker compose config --quiet` | Valida el archivo y resuelve sus variables sin imprimir la configuración. |
| `docker compose up --build -d --wait` | Construye la API, descarga las imágenes que falten, inicia los servicios en segundo plano y espera a que estén listos. |
| `docker compose ps` | Muestra el estado de los servicios y el puerto publicado. |
| `curl --fail http://127.0.0.1:8080/api/health` | Comprueba que la petición pasa por Nginx y que la API puede consultar PostgreSQL. La respuesta esperada es `{"status":"ok"}`. |

Abre [Ritmo](http://127.0.0.1:8080). Puedes consultar y probar las rutas desde la [documentación interactiva de la API](http://127.0.0.1:8080/api/docs).

Si el puerto 8080 está ocupado, crea un archivo `.env` junto a `compose.yaml` con `APP_PORT=8081`, vuelve a ejecutar el comando de arranque y abre el puerto 8081. `DB_PASSWORD` también se puede definir en `.env` antes del primer arranque. PostgreSQL usa ese valor al inicializar el volumen. Cambiar la variable después requiere cambiar también la contraseña del rol existente en PostgreSQL.

## Prueba de persistencia

1. Crea una cuenta e inicia sesión. Crea un hábito, márcalo como completado y añade un bloque en la misma fecha.
2. Cambia de fecha. El hábito aparece pendiente y el bloque solo aparece en su fecha original.
3. Ejecuta `docker compose down`. Elimina los contenedores y la red de Ritmo y conserva el volumen.
4. Ejecuta `docker compose up -d --wait`. Recrea los contenedores con las imágenes existentes y monta el mismo volumen.
5. Abre la fecha original. El bloque y la marca siguen guardados.

Para identificar el volumen, ejecuta `docker volume inspect ritmo_postgres_data`. Muestra sus metadatos sin cambiar los datos. La opción `--volumes` en `docker compose down` elimina el volumen de esta aplicación y borra su agenda e historial.

## Trabajar en la siguiente iteración

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `frontend/` | Vista diaria, formularios y llamadas a la API. Vite compila el dashboard React y la interfaz anterior; Nginx sirve los archivos de dist. |
| `api/main.py` | Rutas de la API y reglas de validación. |
| `api/db.py` | Conexión a PostgreSQL y ejecución de migraciones. |
| `api/migrations/` | Cambios de esquema ordenados por nombre. El siguiente número disponible es `005`. No edites migraciones ya aplicadas. Cada migración aplicada queda registrada en `schema_migrations`. |
| `nginx/default.conf` | Configuración del sitio y del proxy. |
| `compose.yaml` | Servicios, variables, verificaciones de disponibilidad y volumen. |

- Para desarrollar el frontend usa Vite (instrucciones de Ritmo 2.0 al final). En Docker hay que reconstruir únicamente web para actualizar sus archivos compilados.
- Tras cambiar la API o añadir una migración, ejecuta `docker compose up --build -d --wait` para reconstruir la imagen y aplicar la migración durante el arranque.
- Tras cambiar la configuración de Nginx, ejecuta `docker compose exec web nginx -t` para comprobar la sintaxis y luego `docker compose exec web nginx -s reload` para cargarla.
- Para revisar errores de arranque, ejecuta `docker compose logs --tail=100 api db web`. Muestra las últimas 100 líneas de cada servicio.

Las próximas iteraciones pueden añadir edición de hábitos, recurrencia semanal y una vista de calendario. La tabla de marcas ya separa el hábito de su cumplimiento en una fecha concreta.

## Referencias

- [Inicio rápido de Docker Compose](https://docs.docker.com/compose/gettingstarted/)
- [Orden de arranque en Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Validación de peticiones en FastAPI](https://fastapi.tiangolo.com/tutorial/body/)
- [Uso básico de Psycopg](https://www.psycopg.org/psycopg3/docs/basic/usage.html)
- [Módulo de proxy de Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

## Cuentas y preparación para producción

Regístrate desde la portada. Las sesiones duran siete días y se revocan al cerrar sesión. Desde la agenda puedes editar el título y las horas de un bloque.

La migración de cuentas conserva las filas antiguas sin asignarlas automáticamente a ninguna cuenta. Así, los datos de una instalación personal anterior quedan en PostgreSQL fuera de las vistas de las nuevas cuentas.

Para publicar y atender a miles de usuarios quedan pendientes HTTPS con cookies seguras, límites de intentos de autenticación, recuperación de acceso, copias de seguridad, agrupación de conexiones, monitoreo y pruebas de carga. El Compose actual sirve como entorno local de desarrollo.

## Plan semanal y categorías

- **Mi día** permite crear o editar bloques y filtrar la agenda por categoría. Las categorías disponibles son Personal, Trabajo, Estudio, Salud y Descanso. Los bloques anteriores pasan a Personal.
- **Plan semanal** reúne los bloques y los hábitos completados de lunes a domingo. Cambia entre Tarjetas y Lista, usa las flechas para cambiar de semana y abre cualquier día desde su encabezado.
- Tras actualizar el proyecto, ejecuta `docker compose up --build -d --wait`. Este comando reconstruye la API, aplica la migración de categorías al arrancar y espera a que los servicios estén disponibles. Conserva el volumen existente.

## Etapa 1: pruebas aisladas

Las pruebas no usan `compose.yaml`: `compose.test.yaml` es un archivo **independiente**,
con proyecto `ritmo-tests`, red interna y PostgreSQL 16 en `tmpfs`. No publica puertos,
no monta `postgres_data` y no requiere detener la aplicación. No combines ambos
archivos usando varios argumentos `-f`, ni cambies el proyecto de pruebas a `ritmo`.
Detener el contenedor `db-test` descarta sus datos temporales.

Requisitos: Docker en ejecución, Compose con soporte de `tmpfs` y `--wait`, y acceso
al socket de Docker. La primera construcción necesita descargar imágenes y paquetes.

Ejecuta cada comando solo si el anterior terminó correctamente:

```sh
docker compose -f compose.test.yaml config --quiet
docker compose -f compose.test.yaml build tests
docker compose -f compose.test.yaml up -d --wait db-test
docker compose -f compose.test.yaml run --rm --no-deps tests
docker compose -f compose.test.yaml run --rm --no-deps backup-check
```

El contenedor de pruebas usa el mismo código y dependencias de la API, añade pytest
y HTTPX, y llama a FastAPI mediante `TestClient`, sin servidor HTTP ni puertos.
Antes del arranque de la aplicación, la suite exige `RITMO_TESTING=1` y el destino
exacto `db-test:5432/ritmo_test` con el rol `ritmo_test`; rechaza alternativas de
conexión. Las migraciones se ejecutan **solo en esa base efímera**. Cada prueba usa
cuentas únicas y no realiza `TRUNCATE` ni limpieza sobre la base de la aplicación.

Cobertura preparada:

- Registro, usuarios duplicados, login correcto/incorrecto y validación de credenciales.
- Hash de contraseña, hash de token, atributos de cookie, logout y vencimiento real
  en PostgreSQL (sin esperar siete días).
- Todas las rutas de negocio sin sesión, aislamiento entre dos cuentas y rechazo
  de modificaciones cruzadas, incluido el intento de enviar un propietario falso.
- Creación, lectura, marcado/desmarcado idempotente y eliminación de hábitos con cascada.
- CRUD de bloques, vista semanal, categorías, fechas límite y validaciones en creación y edición.
- En la etapa 1 no existía edición de hábitos. La mejora de modales añade actualización
  de nombre por `PUT /api/habits/{id}`, conservando marcas e historial.

Para detener y retirar **solo los contenedores y la red de pruebas** cuando ya no
se necesiten:

```sh
docker compose -f compose.test.yaml down
```

No requiere `--volumes`; no afecta al proyecto `ritmo`. Para repetir pruebas con
datos nuevos basta detener y volver a iniciar `db-test`, exclusivamente.

## Pruebas del frontend

Con Node.js 22 o posterior, sin instalar dependencias:

```sh
node tests/frontend.test.mjs
```

Las pruebas usan `node:test`, respuestas HTTP simuladas y un DOM mínimo. Cubren
timeouts al conectar y leer el cuerpo, errores HTTP/validación/red, borrado del bloque
en edición, conservación del editor ante fallos y mensajes tras una escritura exitosa
cuya recarga falla. No sustituyen las pruebas de navegador, accesibilidad o del proxy.

Las peticiones tienen un límite de 15 segundos y no se reintentan automáticamente.
Abortar una petición no revierte una escritura que el servidor ya haya confirmado:
la interfaz indica comprobar el resultado antes de repetir. Los errores `422` muestran
el campo y una explicación en español, sin reflejar los valores enviados. Si una
escritura se confirma pero falla la recarga, el mensaje distingue ambos resultados.
El diseño visual no cambia.

En la etapa 1 el frontend se montaba en solo lectura. Ritmo 2.0 lo compila con Vite;
consulta las instrucciones siguientes. Las migraciones existentes se conservan.

## Respaldo y restauración

Consulta [el procedimiento de respaldo y restauración](docs/backups.md). La comprobación
automática se ejecuta exclusivamente con datos sintéticos y una segunda base temporal
dentro de PostgreSQL de pruebas. Compara todas las filas y valores de secuencias después
de restaurar. Los ejemplos para una instalación real quedan documentados para revisión;
no forman parte de la suite y no deben ejecutarse para verificar esta etapa.

## Estado de verificación en el entorno de implementación

- Sintaxis Python, JavaScript, shell y configuración de ambos Compose: verificadas.
- Aislamiento de Compose: verificado en su configuración resuelta; sin puertos ni
  volúmenes persistentes y con red interna.
- Suite frontend: 12 pruebas aprobadas con `node tests/frontend.test.mjs`.
- Protección del script de respaldo: comprobado el rechazo de ejecución fuera del
  destino autorizado (código 1 antes de invocar clientes PostgreSQL).
- Integración PostgreSQL y recorrido real de respaldo/restauración: requieren Docker.
  No se consideran aprobados hasta observar pytest y `backup-check` terminar con código 0.
  En el entorno inicial el socket de Docker no es accesible y la instalación local
  de dependencias Python tampoco está disponible; no confundir esta limitación con
  un resultado satisfactorio de integración.


## Ritmo 2.0 — dashboard React (primera iteración)

Trabajo en `feature/dashboard-redesign`, sin commits ni push automáticos. Se mantiene
FastAPI, PostgreSQL 16, sus endpoints, cookies y volumen `postgres_data`. No hay nuevas
migraciones. No es necesario iniciar ni reconstruir la API real para revisar el frontend.

La referencia Timeyfi no estaba accesible como imagen en la sesión de implementación.
Se aplicó la descripción: sidebar clara, tarjetas blancas, fondo gris, menta/turquesa,
calendario lateral y paisaje SVG original. La comparación visual con la imagen y la
revisión en navegadores y dispositivos reales quedan pendientes.

### Estructura

```text
frontend/
  index.html / src/main.tsx      entrada React
  src/App.tsx                   sesión, carga por fecha y coordinación del dashboard
  src/api.ts / models.ts        adaptador de endpoints y modelos separados
  src/domain.ts / timer.ts      calendario local y estado del temporizador
  src/components/               calendario, agenda, hábitos, Focus, tareas, acceso e ilustración
  src/dashboard.css             estilos adaptables y foco por teclado
  http.js                       helper HTTP compartido, timeout de 15 segundos
  legacy.html / app.js           interfaz anterior, conservada y compilada por Vite
  tests/                        unidades, contratos HTTP y renderizado de componentes
```

React y TypeScript se introducen sin retirar la interfaz anterior, disponible en
`/legacy.html`, incluida su vista semanal. Vite genera ambos documentos en `dist/`.
La imagen de Nginx copia únicamente el resultado compilado. El contexto de construcción
excluye secretos, dependencias locales y respaldos mediante `.dockerignore`.

### Funciones disponibles y límites

- Inicio, registro y cierre de sesión con los endpoints actuales. Las sesiones vencidas
  limpian el contenido privado y muestran el acceso. No se almacenan tokens ni contraseñas
  en localStorage. No existe endpoint de perfil: tras recargar se muestra «Mi cuenta»;
  el nombre introducido solo se conserva en memoria durante esta pestaña.
- Calendario mensual con selección de días y navegación. La agenda y los hábitos se
  consultan por fecha; no se interpretan respuestas fallidas como listas vacías.
- Agenda real: crear, editar y eliminar bloques, respetando categorías y segundos al editar.
  Borrar el bloque en edición reinicia el editor solo después de confirmar el borrado.
- Hábitos reales: crear, marcar/desmarcar por fecha y eliminar con confirmación del historial.
- Búsqueda de títulos de bloques y nombres de hábitos de la fecha seleccionada.
- Exportación JSON de los hábitos y bloques cargados de ese día; no es un respaldo de base
  de datos. El archivo puede contener información privada de la agenda.
- Focus local: 15, 25, 45 o 60 minutos, iniciar, pausar, reanudar y reiniciar. Calcula el
  tiempo contra una fecha límite y se actualiza al volver a la pestaña. No registra sesiones
  en la API, no persiste al recargar y no garantiza una alarma si se cierra el navegador.
- Tareas (Ritmo 2.1): CRUD real mediante `/api/tasks`, con filtros, captura rápida y progreso
  diario. Modelo independiente de los bloques. Consulta las instrucciones de la sección 2.1
  antes de reiniciar cualquier API: hay una nueva migración pendiente de revisión.
- Notificaciones: botón informativo, sin servicio de avisos ni indicadores ficticios.
  Estadísticas: solo conteos del día real; tendencias e historial quedan pendientes.
- La interfaz incorpora etiquetas, enlaces de salto, foco visible, controles por teclado,
  confirmaciones de borrado y preferencia de movimiento reducido. No se ha certificado
  accesibilidad ni verificado visualmente en un navegador desde este entorno.

### Desarrollo y comprobación sin modificar datos existentes

Requiere Node 22.12 o posterior. Desde la raíz:

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

`npm test` ejecuta también las 12 pruebas originales, sin omitirlas. Las nuevas pruebas
cubren fechas locales/bisiestas/límite, transiciones de Focus, contratos de endpoints,
propagación de 401, renderizado accesible y estados honestos de tareas. El cargador de
pruebas usa el compilador TypeScript instalado; no requiere soporte strip-types de Node.

Para desarrollo con recarga automática, Vite usa `127.0.0.1:5173` y falla si está ocupado
(`strictPort`), en lugar de ocupar automáticamente otro puerto. Su proxy apunta por
omisión a Nginx en `127.0.0.1:8080`. Las operaciones enviadas a ese destino escriben en
su base; para probar altas y borrados usa exclusivamente la instalación aislada siguiente.

### Dashboard completo con base temporal de prueba

Elige primero un puerto libre (5180 por omisión). No combinar estos archivos con
`compose.yaml`. El proyecto sigue siendo **ritmo-tests**, con PostgreSQL en tmpfs y sin
montar `postgres_data`:

`web-preview` se conecta a `test-only` para consultar la API y a `preview-access`,
una red bridge no interna exclusiva de Nginx, para publicar el puerto en localhost.
La API y PostgreSQL permanecen únicamente en la red interna; no publican puertos.

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml config --quiet
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

Si los contenedores ya estaban arrancados con la configuración anterior (solo red
interna), aplica el cambio recreando exclusivamente la web, sin reiniciar PostgreSQL
ni perder los datos temporales de `tmpfs`:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml config --quiet
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up -d --no-deps --force-recreate web-preview
curl --fail --head --max-time 10 http://127.0.0.1:5180/
```

La comprobación debe devolver una respuesta HTTP satisfactoria. Si se usa otro
`DASHBOARD_TEST_PORT`, conserva ese valor al recrear y ajusta también la URL de curl.

Abre `http://127.0.0.1:5180`. Crea exclusivamente una cuenta de prueba y comprueba calendario,
CRUD de bloques, hábitos, cambio de usuario y logout. La base empieza sin ejemplos y sus
datos desaparecen al detener `db-test`. No ejecutes la suite ni el verificador de backup
mientras escribes desde la vista previa. Si 5180 está ocupado, usa otro puerto libre:

```sh
DASHBOARD_TEST_PORT=5181 docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

Para desarrollar React contra ese backend temporal:

```sh
RITMO_API_PROXY_TARGET=http://127.0.0.1:5180 npm --prefix frontend run dev
```

Abre `http://127.0.0.1:5173` (o selecciona un puerto libre con `-- --port 5175`). Usa siempre
el mismo origen durante una sesión de prueba. Para retirar solo esta instalación:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml down
```

### Actualizar solo la web de una instalación existente, después de revisión

```sh
docker compose -f compose.yaml build web
docker compose -f compose.yaml up -d --no-deps web
```

Esto reemplaza únicamente el contenedor web y no arranca la API ni ejecuta sus migraciones.
Mantiene el puerto configurado y el volumen real. No se ha ejecutado durante esta entrega.
La configuración Nginx conserva `/api/` y sirve recursos con hash en `/assets/`; el HTML se
revalida para evitar referencias a builds antiguos. Se usan pestañas/estados locales de
React, por lo que no se requiere un fallback SPA que oculte errores 404 de archivos.

### Verificación de esta entrega

Resultado local: build con chequeo TypeScript aprobado y **26 pruebas frontend aprobadas**
(12 originales y 14 nuevas). Las configuraciones Compose y `git diff --check` también
se validaron. Docker,
las pruebas de integración con PostgreSQL y la inspección visual en navegador se informan
por separado: nunca se consideran aprobados solo porque compile el frontend. La copia
de seguridad sigue el procedimiento de `docs/backups.md` y solo se verifica con datos de
prueba, no mediante la exportación JSON del dashboard.


## Ritmo 2.1 — tareas reales

La migración nueva `api/migrations/004_tasks.sql` crea exclusivamente la tabla `tasks`
y sus índices. No modifica las migraciones previas ni las tablas de hábitos o bloques.
`api/tasks.py` contiene el router, los modelos y las consultas; el Dockerfile copia este
módulo. La interfaz anterior se conserva en `/legacy.html` y no incorpora tareas.

### Modelo y reglas

- `id` entero y `account_id` obligatorio obtenido de la sesión, nunca del cliente.
- `title`: entre 1 y 80 caracteres, sin espacios exteriores; `description`: opcional,
  hasta 2000 caracteres. Una descripción vacía se normaliza a `null`.
- `completed`: booleano estricto; `priority`: `baja`, `media` (predeterminada) o `alta`.
- `category`: `personal` (predeterminada), `trabajo`, `estudio`, `salud` o `descanso`.
- `due_date`: fecha opcional, sin hora. Se admiten tareas sin fecha y fechas pasadas.
- `created_at` y `completed_at`: timestamps del servidor, con zona horaria. Completar
  fija `completed_at`; repetirlo conserva la fecha. Reabrir la elimina. No son editables
  desde el cliente. Una restricción SQL mantiene coherencia entre estado y timestamp.
- Todas las consultas y mutaciones exigen propietario. Un ID ajeno devuelve el mismo
  `404` que uno inexistente. Los cuerpos rechazan campos desconocidos o propietarios
  enviados por el cliente. La aplicación no utiliza tareas como bloques de horario.

### API

| Método y ruta | Uso |
| --- | --- |
| `POST /api/tasks` | Crear; devuelve tarea con `201`. |
| `GET /api/tasks` | Lista paginada: `items`, `total`, `limit`, `offset`. |
| `GET /api/tasks/{id}` | Consultar una tarea propia. |
| `PATCH /api/tasks/{id}` | Editar solo los campos enviados; también completar o reabrir con `completed`. |
| `DELETE /api/tasks/{id}` | Eliminar una tarea propia; `204`. |
| `GET /api/tasks/progress/{day}` | Progreso de tareas con vencimiento ese día. |

Filtros combinables de listado: `status=pending|completed`, `category`, `priority`,
`due_date=AAAA-MM-DD` o `undated=true`. Fecha y `undated=true` son incompatibles.
`limit` admite de 1 a 100, por omisión 50; `offset` empieza en 0. Se ordenan pendientes
primero, vencimiento ascendente (sin fecha al final), prioridad alta primero e ID
descendente para desempatar. Cuenta y página se leen en una transacción consistente.
El listado, el detalle y el progreso se devuelven con `Cache-Control: no-store`.

Ejemplo de edición parcial: `{"completed":true}`. `description` y `due_date` admiten
`null` para borrar su valor; título, estado, prioridad y categoría no lo admiten.
Una edición vacía devuelve `422`. No se añade un `PUT` ambiguo ni se sobrescriben
campos que el cliente no haya enviado.

### Comportamiento del dashboard

El Dashboard muestra inicialmente tareas con vencimiento en el día seleccionado.
El apartado Tareas abre inicialmente todas las fechas; dispone de filtros por estado,
categoría, prioridad y fecha seleccionada/sin fecha/cualquier fecha, y paginación de 50.
La fecha se cambia desde el calendario lateral o el selector del apartado Tareas.

El formulario rápido crea una tarea con título, prioridad media, categoría Personal y
vencimiento en la fecha seleccionada. «Nueva tarea» y «Editar» abren el formulario completo,
donde se puede quitar el vencimiento. Marcar la casilla completa; desmarcar reabre.
Eliminar pide confirmación y cierra el editor si corresponde. Un cambio guardado puede
quedar fuera de los filtros actuales; la interfaz lo indica y vuelve a consultar la API.

El progreso es `completadas / total` para **todas las tareas que vencen en la fecha
seleccionada**, sin aplicar los filtros de lista ni la paginación. Las tareas sin fecha
no contribuyen. Es el estado actual, no una reconstrucción histórica: completar hoy una
tarea de ayer actualiza el progreso de ayer. No se afirma que mida tareas completadas
exactamente durante ese día. Esta definición queda abierta a revisión para estadísticas
históricas futuras.

La carga, el error y la lista vacía son estados separados. No se convierten errores de
red en resultados vacíos. Una petición vencida no se reintenta automáticamente. Ante un
401 se limpia la sesión visible. No hay tareas de ejemplo en la aplicación ni datos
persistentes simulados. La exportación de día actual continúa incluyendo solo hábitos
y bloques; la interfaz legacy y la búsqueda superior mantienen ese mismo alcance.

### Pruebas y verificación segura

**No ejecutar el Compose principal ni reiniciar su API para verificar esta entrega.**
El arranque de FastAPI aplica las migraciones pendientes: `004_tasks.sql` debe revisarse
antes de cualquier despliegue sobre datos reales.

Para frontend, sin conectarse a ninguna base:

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

Para PostgreSQL temporal, sin puertos publicados ni volumen real:

```sh
docker compose -f compose.test.yaml config --quiet
docker compose -f compose.test.yaml build tests
docker compose -f compose.test.yaml up -d --wait db-test
docker compose -f compose.test.yaml run --rm --no-deps tests
docker compose -f compose.test.yaml run --rm --no-deps backup-check
```

Ejecutar cada comando solo si el anterior terminó con código 0. Hay 38 casos nuevos
preparados para tareas: CRUD, persistencia observada desde otra conexión y otro cliente,
aislamiento, validación, filtros combinados, paginación, progreso, restricciones SQL y
reaplicación idempotente de migraciones. Se mantienen los 48 casos previos. El verificador
de respaldo incluye ahora tareas, sus datos y la secuencia de identidad.

Para verificar en navegador con cuenta sintética, elige un puerto libre y usa únicamente
los Compose de pruebas. Si la vista previa ya existe, detén solo su API para no tener
escritores mientras corre la suite, sin detener PostgreSQL temporal:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml stop api-preview
```

Después de la suite y del backup, reconstruye la API de pruebas y la web:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

Abre `http://127.0.0.1:5180`. Crea una cuenta de prueba; añade tareas desde Dashboard,
edita descripción/prioridad/categoría/fecha, completa y reabre, prueba filtros, elimina y
comprueba el progreso. Cierra sesión y entra con otra cuenta: no debe ver las tareas de
la primera. Recarga la página para comprobar la persistencia en esa base. No detengas
`db-test` entre comprobaciones: `tmpfs` descarta sus datos al detener el contenedor.

Las redes de la vista previa conservan el arreglo de 2.0: solo Nginx tiene red bridge de
acceso; API y PostgreSQL siguen internos, sin publicar 5432. No se han creado commits ni
se ha hecho push. La migración principal queda pendiente de revisión, respaldo y una
prueba satisfactoria sobre PostgreSQL temporal.

Resultado en el entorno de implementación: **30 pruebas frontend aprobadas**, build
con TypeScript aprobado, sintaxis Python/shell válida y Compose de pruebas validado.
Los 38 casos nuevos de PostgreSQL (más los 48 previos) están preparados pero no se
ejecutaron: el socket de Docker devuelve `permission denied`. Tampoco se ejecutó la
migración ni el recorrido de respaldo/restauración sobre una base. La integración
frontend usa `fetch` simulado y renderizado de componentes; no certifica todavía una
sesión real de navegador contra PostgreSQL.


## Formularios en modal — tareas y hábitos

Los editores completos salen del flujo del dashboard y usan un componente compartido
`Modal`, basado en `<dialog>` y `showModal()`. Se conserva la captura rápida superior de
tareas; «Nueva tarea» y los botones de editar abren el modal con datos vacíos o precargados.
«Nuevo hábito» abre una variante pequeña y cada hábito tiene un botón de edición.
No se cambia el diseño de las tarjetas ni se elimina la interfaz anterior.

El diálogo nativo mantiene el resto de la página inerte y contiene el foco. Se enfoca
el primer campo al abrir y se devuelve el foco al disparador al cerrar (o al contenido
principal si el disparador ya no está disponible). Se bloquea el scroll del fondo y el
formulario puede desplazarse en pantallas pequeñas. Se respeta movimiento reducido.

Se puede cerrar mediante X, Cancelar, Esc o un clic en el fondo superpuesto. Pulsar o
seleccionar texto dentro de la tarjeta no la cierra; arrastrar desde dentro hacia fuera
tampoco descarta la edición. Cerrar sin guardar descarta el borrador. Mientras se guarda
se deshabilitan controles y cierre, con un mensaje de espera. Un fallo mantiene el modal,
los valores y el mensaje de error; el cierre solo se realiza tras confirmar el guardado.
Si falla después la recarga de la lista, se conserva el aviso existente de cambio guardado.

Para permitir edición real de hábitos se añade `PUT /api/habits/{habit_id}` con cuerpo
`{"name":"Nuevo nombre"}`. Devuelve `204`; valida la misma etiqueta de 1 a 80 caracteres,
actualiza únicamente el nombre y exige propietario en el SQL. IDs ajenos o inexistentes
responden `404`. No hay migraciones nuevas ni cambios de esquema. La API anterior debe
reconstruirse para que la edición de nombre funcione; las demás operaciones conservan
sus endpoints y comportamiento.

### Verificación

```sh
npm --prefix frontend test
npm --prefix frontend run build
```

La suite incluye apertura/cierre del diálogo con adaptadores DOM, foco inicial/restauración,
scroll, detección del fondo, protección durante el guardado, renderizado de ambos editores,
precarga de campos, errores y contrato HTTP de edición de hábitos. Estas comprobaciones
no sustituyen la interacción nativa en un navegador. Las pruebas PostgreSQL existentes
se amplían para comprobar nombre actualizado sin perder marcas, validaciones, sesión
y aislamiento. No se ejecutan contra la base principal.

Para comprobar manualmente en la instalación temporal (puerto libre 5180):

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

1. Abrir `http://127.0.0.1:5180` con una cuenta de prueba.
2. Pulsar «Nueva tarea»: el primer campo debe recibir el foco; Tab y Shift+Tab deben
   permanecer dentro del diálogo. Verificar que no cambia el alto del dashboard.
3. Guardar una tarea y editarla; comprobar título, descripción, prioridad, categoría
   y fecha precargados. Confirmar que la captura rápida continúa funcionando.
4. Pulsar «Nuevo hábito», guardar y editar el nombre. Comprobar que sus marcas se conservan.
5. Comprobar por separado X, Esc, Cancelar y clic fuera; deben descartar el borrador y
   devolver el foco. Los clics en el relleno interior no deben cerrar.
6. Probar campos vacíos y límites de longitud. Simular un error de red en herramientas
   de desarrollo: el modal debe conservar valores y mostrar el error, sin fingir éxito.
7. Revisar en móvil el scroll del formulario y el fondo bloqueado. No usar cuentas ni
   datos reales para estas comprobaciones.

La validación local de esta mejora consta de 37 pruebas frontend y build TypeScript.
La contención nativa del foco, Esc y el clic del backdrop requieren además la revisión
manual en navegador. PostgreSQL y Docker se informan aparte si el entorno no permite
acceder a sus servicios; no se consideran aprobados por el resultado del build.


### Corrección de superposición: tareas, hábitos y bloques

Se encontró un formulario inline en `Agenda`: «Añadir bloque» y «Editar» aún expandían
contenido dentro de la tarjeta. Se sustituyó por `BlockEditor`, que comparte `Modal`
con tareas y hábitos. Se retiraron esos formularios y estilos inline del dashboard;
solo permanece la captura rápida de tareas. La interfaz legacy conserva su diseño anterior.

Tareas y hábitos ya llamaban `showModal()` en el código inspeccionado; no fue posible
reproducir su presentación inline en el navegador de este entorno. Para reforzar el
comportamiento, todos los modales ahora se montan mediante portal directamente en `body`,
se abren con `showModal()` en `useLayoutEffect` antes de pintar y usan `position: fixed`,
`inset: 0` y márgenes automáticos. Un diálogo cerrado tiene `display: none`. No se usa
el atributo `open` como sustituto de la apertura nativa. `::backdrop` oscurece el fondo.

El bloqueo de scroll actúa sobre la raíz, conservando la anchura y restaurando el scroll
al cerrar, sin sacar `body` de su flujo ni alterar los elementos sticky del dashboard.
La altura máxima y el desplazamiento interno permiten utilizar formularios largos en
móvil. Se mantienen X, Esc, Cancelar, clic fuera, foco inicial y devolución del foco.
Los errores de bloques también aparecen dentro del modal; guardar solo cierra tras
confirmar la operación. No hay cambios nuevos de API ni migraciones en esta corrección.

**Importante para comprobar el resultado:** Nginx sirve un build copiado en su imagen;
editar TSX o CSS no actualiza un contenedor ya construido. Para instalar solo la web
nueva en la vista previa, sin iniciar ni recrear la API o PostgreSQL:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml build web-preview
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up -d --no-deps web-preview
```

Recargar `http://127.0.0.1:5180/` (no `/legacy.html`) y comprobar crear/editar tareas,
hábitos y bloques. El encabezado y las tarjetas no deben cambiar de posición ni altura.
En las herramientas del navegador, `document.querySelector('dialog:modal')` debe encontrar
el diálogo y su padre debe ser `document.body`.

#### Comprobación visual sin API ni datos reales

Se incluye una página de regresión, solo para desarrollo. Usa los componentes reales,
permite abrir seis variantes (crear/editar de cada módulo) y mide top layer, portal,
centrado, rectángulo del dashboard, foco inicial, bloqueo y backdrop. No realiza CRUD,
no consulta la API y guardar solo cierra la prueba. No se incorpora al build de producción.

```sh
npm --prefix frontend run dev
```

Abrir `http://127.0.0.1:5173/tests/modal-preview.html`. Vite falla si el puerto está ocupado;
se puede elegir otro libre con `-- --port 5175`. Cada apertura muestra PASS/FAIL medidos
en ese navegador. Verificar además Tab/Shift+Tab, Esc, X, Cancelar y clic fuera, tanto en
escritorio como en móvil y después de desplazar la página.

La suite local tiene 40 pruebas frontend aprobadas y el build incluye chequeo TypeScript
de la página de regresión. El navegador de herramientas está indisponible, por lo que
las mediciones visuales de esa página **siguen pendientes de ejecución**; los tests con
adaptadores DOM y renderizado estático no prueban geometría real por sí solos.

## Ritmo 2.2 — calendario avanzado

El apartado Calendario incorpora **Día, Semana y Mes** conservando sidebar, barra superior,
paleta menta y modales. Seleccionar un día del pequeño calendario del Dashboard abre
esa fecha en la vista diaria del calendario avanzado.

- **Día:** tareas con vencimiento en la fecha, separadas como «sin horario», y bloques
  ordenados por hora de inicio. No se convierten tareas en bloques.
- **Semana:** siete columnas de lunes a domingo en escritorio, bloques posicionados en
  el horario de 00 a 24 h y carriles para solapamientos; las tareas se muestran aparte
  sin inventar una hora. En móvil se apilan siete agendas diarias para evitar overflow.
- **Mes:** indicadores T/B por día y hasta tres accesos a actividades por celda. «Ver día»
  abre la agenda completa. En móvil se priorizan contadores y acceso al día.
- Seleccionar una actividad abre detalles con edición/eliminación. Las tareas también
  permiten completar/reabrir. Crear y editar reutiliza `TaskEditor` y `BlockEditor`;
  el calendario permite cambiar la fecha de un bloque, sin alterar el formulario del Dashboard.
- Tareas sin vencimiento siguen en Tareas y no se asignan a una fecha ficticia.
- Se distinguen carga, periodo vacío, fallo y guardado confirmado con recarga fallida.

### Consulta eficiente y límites

`GET /api/calendar?start=AAAA-MM-DD&end=AAAA-MM-DD` devuelve `start`, `end`, `tasks` y
`blocks` (estos incluyen `day`). Los extremos son inclusivos, de 1 a 42 días. Se usa una
transacción de lectura consistente y dos consultas filtradas por cuenta y fecha, con los
índices existentes. No se modifica ninguna migración ni se añade una nueva.

El mes requiere una única petición de calendario, no una por día. La aplicación aún puede
consultar el día seleccionado para los contadores/hábitos existentes del dashboard; eso
no genera una consulta por cada celda del mes. Cambiar Semana/Mes dentro del mismo rango
no necesita lecturas por día.

Se incluyen hasta 1000 tareas y 1000 bloques por intervalo. Si se supera cualquiera de
esos límites, la API devuelve `413` y pide reducir el periodo, en lugar de mostrar datos
parciales como completos. Las tareas sin fecha quedan fuera. Se conserva `Cache-Control:
no-store`, sesión obligatoria y el filtro `account_id` en ambas consultas.

### Código y configuración reutilizable

- `api/calendar_routes.py`: contrato y lectura por intervalo.
- `frontend/src/calendarDomain.ts`: fechas de negocio, navegación y carriles.
- `frontend/src/calendarService.ts`: acceso a datos y operaciones existentes.
- `frontend/src/components/calendar/`: vistas, detalles y coordinación.
- `frontend/config.js`: base de API, timeout y credenciales compartidos con legacy.

`VITE_API_BASE_URL` permite configurar un prefijo del mismo origen (por omisión `/api`)
o un endpoint HTTPS. Consulta `frontend/.env.example`. No incluir secretos en variables
VITE: son públicas. Una URL externa requiere adaptar y verificar CORS/cookies del servidor;
esta configuración no lo hace automáticamente. El proxy de desarrollo permanece en Vite.

La [propuesta multiplataforma](docs/multiplataforma.md) documenta reutilización React/TS,
web/PWA, evaluación Tauri/Capacitor, autenticación, almacenamiento y sincronización futura.
No hay instaladores, offline, service worker ni dependencias de esos runtimes en esta etapa.

### Verificación segura

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

Se mantienen las pruebas previas y se añaden nueve pruebas frontend: intervalos, año
bisiesto/límites, navegación, carriles, vistas, estado de carga, contrato de consulta única,
errores y configuración portable. **Resultado local: 49 pruebas frontend aprobadas y build
TypeScript correcto.** Dieciséis casos nuevos de PostgreSQL comprueban inclusión de
extremos, intervalos inválidos, pertenencia, límites, orden y lectura tras escritura.

Docker devuelve `permission denied` en este entorno: no se ejecutaron esos casos de
PostgreSQL ni se construyeron/recrearon contenedores. La validación de configuración
Compose, sintaxis Python y `git diff --check` sí se puede ejecutar sin conectar a una base.
No se ha realizado una revisión visual de escritorio/móvil en navegador.

Para probar PostgreSQL temporal, detén solo la API de vista previa si ya existe, sin
parar `db-test`. No combinar estos archivos con el Compose principal:

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml stop api-preview
docker compose -f compose.test.yaml build tests
docker compose -f compose.test.yaml up -d --wait db-test
docker compose -f compose.test.yaml run --rm --no-deps tests
```

Ejecuta cada comando solo si el anterior terminó correctamente. Para abrir la vista
previa completa (elegir un puerto libre; 5180 por omisión):

```sh
docker compose -f compose.test.yaml -f compose.dashboard-test.yaml up --build -d --wait web-preview
```

Abre `http://127.0.0.1:5180` y usa una cuenta sintética. Crear tareas con distintos
vencimientos y bloques con horas solapadas; revisar las tres vistas, navegación, detalles,
edición/reapertura y eliminación. Probar también otra cuenta, fecha bisiesta, móvil y
fallo de red. El calendario no debe reemplazar un error con una lista vacía.

Para desarrollo React con ese backend temporal:

```sh
RITMO_API_PROXY_TARGET=http://127.0.0.1:5180 npm --prefix frontend run dev
```

Abrir `http://127.0.0.1:5173`. `strictPort` evita ocupar otro puerto si está en uso.
La API temporal aplica las migraciones que ya existan en esta rama; no reiniciar la API
principal sin revisar las migraciones pendientes de entregas anteriores. Esta iteración
no toca datos reales, volúmenes ni la rama main, y no crea commits ni push.

Limitaciones: no hay arrastrar/soltar, recurrencias, calendario compartido, integración
con calendarios del sistema, alarmas nativas ni sincronización offline. Las fechas límite
no tienen hora; los bloques conservan su horario local flotante y no cruzan medianoche.
La revisión en navegador y la ejecución de PostgreSQL temporal siguen pendientes.
