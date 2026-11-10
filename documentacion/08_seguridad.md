# Capítulo 8 Informe de seguridad

## 8 1 Alcance de la revisión

La revisión cubre validadores, autenticación, roles, consultas, configuración del laboratorio y dependencias de la API. Se limita al código y a las comprobaciones registradas. No constituye una auditoría externa ni una certificación de cumplimiento legal.

## 8 2 Controles existentes

| Riesgo | Control y comprobación |
| --- | --- |
| Inyección SQL | Consultas parametrizadas y validadores de identificadores y filtros; casos automáticos de entradas manipuladas |
| Acceso de un cliente a administración | Rol obtenido de la base y middleware de autorización; pruebas de rechazo de operaciones |
| Exposición de contraseña | Hash bcrypt; el perfil público no devuelve hash ni secretos |
| Duplicación o solapamiento de reservas | Transacciones, bloqueos y clave de idempotencia |
| Uso de documentos privados | Validación de identidad y permisos para consultar imágenes |
| Configuración privada publicada | .gitignore y .dockerignore excluyen secretos y claves locales |
| Intercepción de entrada | HTTPS en Apache y en el balanceador; revisión de certificado y nombre |
| Privilegios excesivos | Contenedor API como node y cuenta MySQL limitada a operaciones de datos |

## 8 3 Consideraciones sobre XSS y documentos

React presenta texto mediante su representación normal y la API aplica límites y validación de entradas. El backend incorpora cabeceras de seguridad mediante Helmet en sus rutas habituales. Estas medidas reducen riesgos, pero no equivalen a haber ejecutado una prueba exhaustiva de XSS. La revisión de todos los contextos de salida, de las políticas del servidor y de archivos subidos requiere una evaluación específica.

La prueba de licencias usa exclusivamente imágenes ficticias. Los archivos de evidencia no deben incluir fotografías reales de documentos, sesiones activas, secretos ni información de clientes. El repositorio es público y contiene la aplicación y documentación académica, sin la base privada de usuarios.

## 8 4 Riesgos residuales

La falta de redundancia del equipo y de MySQL afecta a la disponibilidad. Los enlaces internos HTTP y MySQL sin TLS quedan dentro de la red Docker privada del laboratorio. Para una infraestructura distribuida se deberán revisar cifrado interno, permisos, acceso administrativo y gestión de secretos.

La simulación de falla solo debe habilitarse para la demostración. Los puertos de diagnóstico no deben exponerse sin revisión. El certificado autofirmado no debe confundirse con un certificado público emitido para el negocio.

## 8 5 Resultados y acciones

La revisión de dependencias se registra en auditoria-backend.json con la fecha de ejecución. Sus resultados no cubren el sistema operativo ni todas las imágenes Docker. Las pruebas automáticas de permisos y validación se encuentran en la suite del backend. Los hallazgos que aparezcan en el acta deberán resolverse o presentarse con su alcance antes de ampliar el uso de la instalación.
