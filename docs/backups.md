# Respaldo y restauración de Ritmo

Estos procedimientos no requieren eliminar contenedores ni volúmenes de la aplicación.
**En esta etapa solo se autoriza ejecutar la verificación con datos sintéticos.**
Los ejemplos de respaldo real se documentan para una operación posterior; no se han ejecutado.

## Verificación automática con datos de prueba

Desde la raíz del repositorio:

```sh
docker compose -f compose.test.yaml config --quiet
docker compose -f compose.test.yaml build tests
docker compose -f compose.test.yaml up -d --wait db-test
docker compose -f compose.test.yaml run --rm --no-deps tests
docker compose -f compose.test.yaml run --rm --no-deps backup-check
```

Ejecutar cada comando solo si el anterior terminó con código 0. El contenedor de
base de datos permanece en ejecución entre las pruebas y el respaldo: los datos
de `tmpfs` desaparecen si se detiene. No ejecutar la suite y el respaldo en paralelo.

El servicio `backup-check` usa clientes PostgreSQL 16 y un script montado en solo
lectura. Rechaza cualquier destino diferente de `db-test:5432/ritmo_test` con el
usuario de pruebas. No acepta variables alternativas de conexión.

El procedimiento:

1. Añade una cuenta, un hábito, una marca, un bloque, una tarea, una sesión de acceso y un registro Focus con segmento y clave de petición sintéticos.
2. Genera un archivo de formato custom con `pg_dump`, con permisos privados.
3. Comprueba que `pg_restore` puede leer su catálogo.
4. Crea una base temporal `ritmo_restore_<pid>` en el servidor de pruebas.
5. Restaura con `--single-transaction --exit-on-error`, sin `--clean`.
6. Compara todas las filas de las diez tablas (incluidas tareas, sesiones Focus, segmentos y claves de petición), además de los valores de secuencias.
7. Elimina únicamente la base temporal que acaba de crear y sus archivos temporales.

No se imprimen las filas, hashes ni sesiones. No hay escritores concurrentes
durante la comparación. Las restricciones del esquema se reconstruyen al restaurar.
Un error produce una salida distinta de cero. Un fallo abrupto del proceso puede
dejar la base temporal dentro de **db-test**; desaparece al detener este PostgreSQL
efímero. Nunca se toca `ritmo_postgres_data`.

Esta comprobación verifica un recorrido real de dump/restauración y comparación;
no sustituye una política de backups externos ni una prueba de recuperación del host.

## Respaldo de una instalación real: procedimiento para revisión

No ejecutar como parte de las pruebas. Requiere revisar el destino y tener acceso
al Docker de la instalación. `pg_dump` toma una instantánea consistente y no modifica
filas. El archivo contiene información privada, incluidos hashes y sesiones.

Ejemplo en Bash, desde la raíz del proyecto:

```bash
umask 077
mkdir -p backups
backup_file=$(mktemp backups/ritmo-XXXXXXXX.dump)
if docker compose -f compose.yaml exec -T db sh -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$backup_file"; then
  printf 'Respaldo creado: %s\n' "$backup_file"
else
  rm -f -- "$backup_file"
  echo 'Falló el respaldo; se retiró el archivo incompleto.' >&2
  exit 1
fi
```

Guardar una suma SHA-256 y copiar el respaldo cifrado fuera del host. Establecer
retención y acceso restringido; no enviarlo a Git ni publicarlo. Este dump no incluye
roles globales: sus permisos y secretos necesitan un procedimiento independiente.
Si el rol actual requiere contraseña para una conexión local, configurar un archivo
de contraseñas con permisos `0600`, sin escribir el secreto en el comando.

## Restauración: siempre primero en una base nueva y aislada

1. Usar un servidor PostgreSQL 16 separado, sin montar el volumen real y sin
   publicar puertos innecesarios. No usar `docker compose exec db` como destino.
2. Comprobar el archivo con `pg_restore --list ARCHIVO` y verificar su suma.
3. Crear una base vacía con `createdb --template=template0 BASE_NUEVA`.
4. Restaurar con el cliente 16:

   ```sh
   pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
     --dbname=BASE_NUEVA ARCHIVO
   ```

5. Comprobar tablas, migraciones, relaciones, secuencias y funcionalidades con una
   copia de la API conectada exclusivamente a esa base. Revisar la revocación de
   las sesiones restauradas antes de un eventual cambio de servicio.
6. Solo después de revisar resultados, planificar el cambio de conexión. Este
   documento no autoriza sobrescribir la base actual ni realizar ese cambio.

No usar `pg_restore --clean`, `dropdb` ni `docker compose down --volumes` sobre
la instalación real. No confundir persistencia del volumen con una copia de seguridad.
