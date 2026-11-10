# Acta de verificación de AutoRent

## Fecha y alcance

Verificación ejecutada el 10 de noviembre de 2026 para la entrega del 11 de noviembre. Entorno Windows 11, Docker Desktop 4.99.0, motor Docker 29.9.3, Node 24, MySQL 8.4.13, Apache 2.4.69 y Nginx 1.30.6. Se utilizó exclusivamente la base autorent_gsw y datos ficticios de laboratorio.

## Resultados del software

La revisión de tipos y compilación de la API finalizaron correctamente. La suite del backend aprobó 96 pruebas, incluidas dos comprobaciones específicas de identidad y dependencia del endpoint del clúster. La interfaz también superó revisión de tipos y compilación. La auditoría npm de dependencias de producción del backend informó cero vulnerabilidades registradas en la consulta realizada. Esta comprobación no cubre todas las imágenes ni el sistema operativo.

## Resultados de integración

Se aprobaron 20 comprobaciones y se registraron 0 fallas en la ejecución final del script de integración.

| Prueba | Resultado | Observación |
| --- | --- | --- |
| HTTPS Apache e interfaz | APROBADA | Certificado y nombre verificados; respuesta 200 |
| Salud nodo1 | APROBADA | MySQL conectado e identidad presente |
| Salud nodo2 | APROBADA | MySQL conectado e identidad presente |
| Salud nodo3 | APROBADA | MySQL conectado e identidad presente |
| Balanceo por HTTPS | APROBADA | 12 respuestas; nodos nodo1, nodo2, nodo3 |
| Catálogo dinámico | APROBADA | Tres unidades desde MySQL |
| Administración sin sesión | APROBADA | Rechazo 401 |
| Filtro manipulado | APROBADA | Rechazo 400 |
| Registro de cliente ficticio | APROBADA | Cuenta exclusiva de laboratorio |
| Acceso autenticado | APROBADA | Token no incluido en la evidencia |
| Cotización | APROBADA | Precio calculado en el servidor |
| Documento ficticio | APROBADA | PNG de prueba; ningún documento personal |
| Reserva concurrente | APROBADA | Códigos [409, 201, 409] |
| Idempotencia | APROBADA | Mismo identificador al repetir la solicitud |
| Reserva compartida entre nodos | APROBADA | Lectura autenticada desde otra entrada de nodo |
| Detección de caída | APROBADA | Nodo2 sin servicio |
| Continuidad con nodo2 detenido | APROBADA | Respuesta de nodo3 |
| Catálogo durante falla | APROBADA | Datos accesibles con una API retirada |
| Recuperación nodo2 | APROBADA | Respuesta de salud tras iniciar el contenedor |
| Cancelación de reserva ficticia | APROBADA | Se conserva su historial de prueba |

## Condiciones de la demostración

Los certificados y sus nombres fueron verificados en las solicitudes HTTPS. El balanceador atendió 12 consultas de salud mediante los tres nodos. Se creó una cuenta ficticia, se cotizó y adjuntó una imagen PNG de prueba. Tres solicitudes concurrentes para el mismo vehículo y período produjeron una creación y dos conflictos. La repetición de la solicitud ganadora conservó el identificador. La reserva pudo leerse desde otra entrada de nodo y se canceló al finalizar, conservando su historial.

Se detuvo nodo2 y se comprobó la continuidad de salud y catálogo por el punto de entrada. Después se inició el nodo y se verificó su recuperación. Los servicios quedaron iniciados. Los registros de la primera instalación permitieron corregir la preparación de MySQL y seleccionar puertos de diagnóstico libres antes de la ejecución final.

## Límites y trabajo posterior

No se ejecutó carga comercial sostenida, medición anual de disponibilidad, auditoría externa de seguridad ni validación del manual con usuarios ajenos al equipo. La caída de MySQL o de la computadora no está cubierta por la redundancia de las API. La prueba no acredita disponibilidad anual de 99.9 %. Los resultados automáticos de API no sustituyen una prueba completa de todos los controles administrativos de la interfaz.

## Evidencia reproducible

La suite está en backend/tests. El procedimiento de integración está en tools/verificar_integracion.py y su resultado en evidencias/integracion.json. Los resultados de tipos, compilación, auditoría y comprobación de configuración se conservan en evidencias. El archivo de servicios registra una instantánea de ejecución y puede contener direcciones internas que cambien al recrear contenedores. Los tokens, contraseñas y documentos personales no se incluyen.
