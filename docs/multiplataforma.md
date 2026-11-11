# Ritmo: preparación multiplataforma (2.2)

## Objetivos de distribución

Conservar React y TypeScript para distribuir una misma experiencia en web y, después,
en Windows, Linux, macOS, Android e iOS. El usuario final no debe instalar Docker.
Docker Compose seguirá siendo una herramienta de desarrollo/pruebas y una opción de
operación del servidor, no una dependencia del cliente.

Esta entrega implementa calendario web y separaciones de código; **no genera instaladores,
no instala Tauri/Capacitor y no ofrece todavía funcionamiento offline**. Tampoco incorpora
manifest, service worker, notificaciones nativas ni conexión directa del cliente a PostgreSQL.

## Arquitectura propuesta y separación actual

```text
React: vistas Día/Semana/Mes, detalles y editores modales
                    │
calendarDomain.ts: fechas, límites y posicionamiento (sin IO)
                    │
calendarService.ts: operaciones de datos y coordinación con la API
                    │
src/api.ts → http.js → config.js
                    │
FastAPI remoto HTTPS → PostgreSQL
```

Los componentes de presentación `CalendarViews`, `ActivityDetails`, `TaskEditor` y
`BlockEditor` reciben datos y callbacks. `CalendarWorkspace` coordina estado, errores,
lectura y escrituras mediante `calendarService`. La lógica de calendario no depende de
Docker, DOM, React ni de un proveedor nativo. Los servicios pueden sustituirse por
adaptadores de transporte/locales sin reescribir las vistas.

`config.js` centraliza base pública de API, timeout y política de credenciales. Por
omisión usa `/api` del mismo origen, sin URLs de localhost en producción. El build puede
configurar `VITE_API_BASE_URL` con otro prefijo relativo o un endpoint HTTPS completo.
Las variables `VITE_*` son públicas y **no deben contener secretos**. El proxy de
`vite.config.ts` y `RITMO_API_PROXY_TARGET` pertenecen exclusivamente al desarrollo.
Un build nativo futuro debe aportar su endpoint remoto y no depender de un proxy Vite.

El transporte conserva timeout, errores traducidos y cookies. Para un endpoint HTTPS
externo establece `credentials: include`; esto solo prepara el cliente: **no configura
CORS ni vuelve compatible la autenticación por sí mismo**. No se ha probado aún un origen
nativo. No hay CORS permisivo nuevo en FastAPI.

## Diferencias por plataforma

| Plataforma | Código reutilizable | Adaptaciones futuras |
| --- | --- | --- |
| Web | Todo el frontend y los contratos FastAPI actuales. | HTTPS, CSP, observabilidad, despliegue de servidor y acceso público revisado. |
| PWA | Vistas, dominio, servicios y build Vite. | Manifest, iconos, política de actualización y caché de shell; instalación y soporte por navegador/SO. |
| Tauri escritorio | React/TS, dominio, servicios y assets estáticos. | Contenedor Rust/WebView, capabilities mínimas, CSP, transporte autorizado, archivos, actualizaciones, firma y paquetes por SO. |
| Capacitor móvil | React/TS, dominio y contratos de servicios. | Proyectos Android/iOS, WebView, red/cookies, teclado, safe areas, enlaces profundos, almacenamiento seguro, firma y distribución. |

Tauri es una opción razonable para escritorio porque puede consumir el frontend web
existente y ofrece mecanismos explícitos de permisos/capabilities. La compatibilidad aquí
es una **evaluación de arquitectura**, no una prueba de ejecución nativa. Sus requisitos
se describen en [Tauri: introducción](https://v2.tauri.app/start/),
[seguridad](https://v2.tauri.app/security/) y [distribución](https://v2.tauri.app/distribute/).

Capacitor permite reutilizar la aplicación web dentro de aplicaciones móviles y añadir
APIs nativas cuando sean necesarias. Antes de adoptarlo hay que comprobar el transporte
HTTP y el almacenamiento de cookies en cada WebView. Referencias oficiales:
[Capacitor](https://capacitorjs.com/docs), [HTTP](https://capacitorjs.com/docs/apis/http)
y [Cookies](https://capacitorjs.com/docs/apis/cookies).

El empaquetado necesita herramientas de construcción y certificados por plataforma;
no basta con comprimir `dist/`. El cliente utilizaría un FastAPI operado por Ritmo o por
un administrador. Un modo completamente autónomo exigiría otra decisión de producto y
almacenamiento: no se propone instalar PostgreSQL y Docker en cada teléfono o equipo.
Tauri permite [binaries auxiliares](https://v2.tauri.app/develop/sidecar/), pero no se adopta
un sidecar de FastAPI en esta etapa: añade gestión de procesos, seguridad y actualizaciones.

## Reutilización y aspectos a revisar

- Las fechas de tareas y los horarios locales de bloques conservan el contrato actual.
  El calendario calcula rangos de fechas sin conversiones UTC de la fecha de negocio.
  Antes de sincronizar recordatorios entre zonas horarias hará falta una zona IANA por
  cuenta y decidir la semántica de cambios de horario. No se modifica el esquema ahora.
- Los diálogos usan `showModal()`, portal a `body`, foco y bloqueo de scroll. Revisar
  soporte y comportamiento con teclado virtual en los WebViews elegidos.
- Focus usa una fecha límite, pero una app suspendida no garantiza ticks ni alarmas.
  Notificaciones o finalización fiable en segundo plano requieren APIs específicas.
- Exportar actualmente descarga un Blob. Móvil/escritorio necesitarían un adaptador de
  archivos/compartir y permisos acotados. Esa API nativa no debe filtrarse a las vistas.
- Las rutas, `base` de Vite y el origen de assets deberán verificarse con los protocolos
  de cada contenedor. El build web sigue funcionando con su configuración actual.

## Almacenamiento local futuro (no implementado)

Introducir un contrato `LocalRepository` junto al repositorio HTTP, sin almacenar tokens
ni contraseñas en los objetos de tareas. Para web/PWA, evaluar IndexedDB para entidades,
cola de cambios y metadatos. Para escritorio y móvil, evaluar SQLite mediante un adaptador
mantenido; las preferencias simples y los secretos tienen almacenes diferentes.
La documentación de [Preferences de Capacitor](https://capacitorjs.com/docs/apis/preferences)
lo presenta como almacenamiento ligero de preferencias, no como sustituto de una base
completa para tareas e historial.

Separar los datos por identidad y dispositivo, purgar cachés al cerrar sesión/cambiar de
cuenta y definir cifrado y caducidad según el riesgo. La existencia de una copia local
nunca debe conceder autorización en el servidor. Si el usuario pierde acceso a una cuenta,
resolver explícitamente la retención local; no fusionar automáticamente datos de otra cuenta.

Una PWA empezaría guardando solo el shell estático. **No cachear respuestas privadas de
`/api/` de forma general**. Hoy sus lecturas sensibles usan `no-store`; no hay service
worker que cambie ese comportamiento. Referencia: [MDN: PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps).

## Sincronización futura (no implementada)

Antes de permitir escrituras offline hacen falta contratos adicionales de servidor:

1. Identificadores de cliente/UUID para creaciones offline, vinculados después al ID del
   servidor, y claves de idempotencia para evitar duplicados tras cortes de red.
2. Revisiones o versiones por entidad, `updated_at` y precondiciones para detectar cambios
   concurrentes. No asumir que el esquema actual detecta conflictos.
3. Tombstones de eliminación con política de retención para no resucitar elementos.
4. API incremental por cursor y cuenta; el calendario por intervalo **no sustituye** un
   protocolo de sincronización ni permite inferir eliminaciones fuera del rango consultado.
5. Cola local transaccional de operaciones, reintentos con backoff y confirmaciones
   persistentes. No reintentar automáticamente una creación de estado incierto sin una
   clave de idempotencia.
6. Conflictos visibles: comenzar con rechazo de versiones obsoletas y decisión del usuario;
   no aplicar silenciosamente «última escritura gana» entre dispositivos.

El servidor continúa siendo la autoridad de pertenencia, límites y validaciones. Una
operación sincronizada debe volver a comprobar la cuenta en el momento de aplicarla.

## Autenticación y seguridad

La versión web actual usa una sesión en cookie HttpOnly/SameSite=Lax. Para publicación
requiere HTTPS y configuración de cookies Secure. Las apps con origen WebView/protocolo
nativo pueden ser cross-site respecto al servidor: no asumir que esa cookie funcionará.
Hay que evaluar cookies con orígenes permitidos exactos y defensa CSRF, o un flujo nativo
con tokens breves y renovación segura; ninguna de esas alternativas se implementa aquí.

Si se eligen tokens, usar el almacén seguro de la plataforma, rotación y revocación;
no localStorage ni un archivo JSON del frontend. El código empaquetado y sus variables
públicas no pueden custodiar secretos de servidor. No desactivar validación TLS para
conseguir conectividad.

En Tauri, limitar comandos IPC, capabilities, dominios HTTP y acceso a archivos; en
Capacitor, instalar solo plugins necesarios y revisar sus permisos. No cargar contenido
remoto arbitrario con permisos nativos. Comprobar almacenamiento de cookies, logout,
expiración, cambio de cuenta, enlaces profundos y restauración de app en cada plataforma.
Firmar paquetes y actualizaciones; revisar el backend antes de exponerlo públicamente.

## Plan de empaquetado por etapas

1. **Ahora (2.2):** calendario terminado a nivel de código, tests unitarios/de contratos,
   consulta por intervalo, transporte centralizado y esta documentación. Validación
   PostgreSQL temporal y revisión visual pendientes donde no haya acceso a esos entornos.
2. **Web estable:** completar integración PostgreSQL/navegador, accesibilidad móvil,
   HTTPS, backups/restauración y revisión de autenticación del despliegue.
3. **PWA de shell:** manifest e iconos, instalación y actualización; funcionamiento online
   explícito. Probar en Android/iOS y escritorio antes de prometer soporte uniforme.
4. **Prueba de escritorio:** empaquetar un build con Tauri en entorno aislado; validar
   endpoints remotos, cookies, navegación, archivos y CSP. Firmar y probar cada SO.
5. **Prueba móvil:** contenedores Capacitor, teclado/safe areas, transporte y autenticación,
   suspensión y exportación. Preparar firma y distribución de prueba Android/iOS.
6. **Offline y sincronización:** revisar los contratos anteriores, implementar almacenes
   y servidor de sincronización con pruebas de conflictos y pérdida de conectividad.
7. **Distribución:** canales de actualización, versiones de API compatibles, firma,
   telemetría respetuosa y recuperación. Ningún paso exige Docker al usuario final.

Las etapas 3–7 son propuestas pendientes, no funciones operativas ni decisiones de proveedor
cerradas. No se han añadido runtimes, servicios externos o dependencias nativas en 2.2.

## Decisiones añadidas en 2.3: Focus y métricas

Focus se separa en representación (`FocusTimer`), controlador (`useFocusSession`), servicio
(`focusService`) y funciones puras de visualización. PostgreSQL conserva estado, segmentos,
versión y UUID de petición. Los ticks de la WebView solo repintan: suspender/cerrar la app
no pierde la sesión ni define su duración. Se recupera mediante `/focus/active`.

Por diseño no se declara completada una sesión sin confirmación de la API. El tiempo
corrido se limita a la duración elegida; la recuperación permite confirmar o cancelar.
Una app suspendida no garantiza alarmas, y no se han añadido notificaciones nativas.
La duración confirma tiempo transcurrido según el reloj del servidor, no atención humana.

UUID por cuenta y control de versión preparan reintentos/sincronización, pero **no forman
un sistema offline**. Actualmente las peticiones inciertas se conservan solo en memoria;
una futura cola local necesitará partición por identidad, cifrado si corresponde,
confirmación durable y política de conflictos. Nunca reproducir operaciones de una cuenta
al iniciar sesión con otra. No hay tokens en localStorage ni plugins nativos nuevos.

Los informes reciben zona IANA explícita; Focus usa instantes y los hábitos/tareas/bloques
mantienen sus fechas locales anteriores. La zona todavía no se guarda como preferencia
por cuenta. Acordar esa preferencia y versiones compatibles de reglas IANA antes de
comparar informes entre dispositivos. Rachas y denominadores de hábitos se presentan
como análisis del conjunto actual dentro del periodo, sin inferir fechas de alta ausentes.

La retirada de Focus es lógica y conserva claves de idempotencia; un futuro sincronizador
deberá tratarla como tombstone y respetar la exclusión de métricas. Aún falta definir
retención, exportación de historial y reconciliación offline. Véanse el protocolo y las
limitaciones en [estadisticas-focus.md](estadisticas-focus.md). No cambia la evaluación
previa de Tauri/Capacitor y no se han instalado ni configurado en esta entrega.
