# Ritmo

Organizador personal de agenda y hábitos. En la primera versión puedes elegir una fecha, crear y eliminar bloques de horario, registrar hábitos diarios y marcar cuáles completaste ese día.

## Arquitectura

```text
Navegador → Nginx ── /       → HTML, CSS y JavaScript
                 └─ /api/  → FastAPI → PostgreSQL → volumen postgres_data
```

- **Nginx** sirve la interfaz y reenvía las peticiones de la API. El navegador usa el mismo origen para ambas. Solo Nginx publica un puerto, limitado a la computadora local.
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
| `frontend/` | Vista diaria, formularios y llamadas a la API. Nginx monta esta carpeta en modo de solo lectura. |
| `api/main.py` | Rutas de la API y reglas de validación. |
| `api/db.py` | Conexión a PostgreSQL y ejecución de migraciones. |
| `api/migrations/` | Cambios de esquema ordenados por nombre. El siguiente número disponible es `004`. No edites migraciones ya aplicadas. Cada migración aplicada queda registrada en `schema_migrations`. |
| `nginx/default.conf` | Configuración del sitio y del proxy. |
| `compose.yaml` | Servicios, variables, verificaciones de disponibilidad y volumen. |

- Tras cambiar el frontend, recarga la página para ver los archivos montados.
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
- No existe actualización de nombre de hábito: la prueba documenta el `405` actual.
  No se añade esa función en esta etapa.

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

El frontend se monta en solo lectura: basta recargar para cargar `http.js` y `app.js`.
Esta etapa no cambia las migraciones ni requiere reconstruir o reiniciar la API real.

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
