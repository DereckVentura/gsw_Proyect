# Capítulo 6 Manual de instalación y operación

## 6 1 Requisitos

El laboratorio se preparó para Windows 11 con WSL 2 y Docker Desktop. Se recomienda disponer de al menos 8 GB de RAM según el material del curso; el equipo utilizado tiene aproximadamente 16 GB. Git permite obtener el código. Node.js 24 permite ejecutar las pruebas locales; los contenedores incluyen su propio entorno Node.

Docker Desktop debe estar instalado y su motor iniciado. Los puertos 8088, 8443, 8444 y 19001 a 19003 deben estar libres. No se requiere contratar una nube para esta entrega. Las dependencias de desarrollo se instalan mediante npm ci en backend y web.

## 6 2 Preparación de la configuración

1. Clone el repositorio y abra su carpeta.
2. Ejecute scripts/preparar-laboratorio.ps1 con PowerShell.
3. El script genera contraseñas aleatorias y la firma de sesión en .env si ese archivo no existe.
4. El mismo script genera un certificado autofirmado con nombres localhost y nginx dentro de .local/certs. Utiliza OpenSSL, incluido en Git para Windows.
5. Mantenga privados .env y la clave del certificado. No los copie al repositorio.

Para confiar en el certificado de este laboratorio en Windows se puede importar el archivo público localhost.crt en el almacén del usuario actual. El certificado está limitado a servidor y no actúa como autoridad de certificación para emitir otros certificados. El operador debe revisar la identidad antes de agregar confianza. Un certificado de otro equipo debe revisarse de nuevo.

## 6 3 Inicio

1. Abra Docker Desktop y espere a que su motor esté disponible.
2. Ejecute INICIAR.cmd, o scripts/iniciar-laboratorio.ps1 desde PowerShell.
3. Docker construye la API y la interfaz y descarga las imágenes oficiales necesarias.
4. El servicio inicializar aplica migraciones en autorent_gsw y establece la flota y los datos ilustrativos de una base nueva.
5. El inicializador limita la cuenta de la API a SELECT, INSERT, UPDATE y DELETE.
6. Cuando los servicios estén listos, abra https://localhost:8443.

La primera ejecución requiere conexión a Internet y tarda más por la descarga de imágenes. El inicializador no importa las reservas ni las cuentas de las instalaciones reales. Al encontrar vehículos en la base del laboratorio conserva sus datos y evita repetir la carga inicial.

## 6 4 Comandos de operación

| Objetivo | Comando desde la raíz del repositorio |
| --- | --- |
| Ver servicios | docker compose ps |
| Consultar salud de tres nodos | powershell -File scripts/verificar-cluster.ps1 |
| Detener una réplica | docker compose stop nodo2 |
| Recuperar la réplica | docker compose start nodo2 |
| Ver registros de la API | docker compose logs --tail 50 nodo1 |
| Ver registros del balanceador | docker compose logs --tail 50 nginx |
| Detener el laboratorio conservando datos | docker compose down |
| Reconstruir tras cambiar código | docker compose up -d --build |

La opción de borrar volúmenes elimina los datos del laboratorio; no es parte del apagado habitual. La carpeta de secretos debe conservarse junto al volumen de datos: generar una contraseña distinta no cambia automáticamente la contraseña existente dentro de MySQL.

## 6 5 Comprobaciones y recuperación

Compruebe primero Docker, después MySQL, el inicializador y las tres API. Si una API no está saludable, revise sus registros y la respuesta de /api/v1/health/database. Si Apache no inicia, revise el certificado y su configuración. Un error de puerto ocupado requiere liberar el puerto o cambiar la publicación y las direcciones documentadas.

El volumen conserva datos frente a la recreación de las API, pero no sustituye un respaldo. Antes de modificar una instalación con datos útiles, genere un respaldo y pruebe su restauración en otra base. No aplique volcados a una base útil sin revisar el destino.

## 6 6 Seguridad del despliegue

La base no publica puertos. Los accesos de diagnóstico se enlazan solo a la dirección local. La confianza en proxies se ajusta al recorrido Apache y Nginx. Esta configuración académica necesita revisión de exposición, certificados públicos, respaldos y redundancia de base y puntos de entrada antes de un uso comercial.
