# Capítulo 4 Plan de pruebas

## 4 1 Alcance y preparación

Las pruebas verifican las rutas de negocio, los permisos, la instalación, HTTPS, identidad de réplicas y recuperación de una API. La base autorent_gsw es independiente de las instalaciones reales. Los datos de cuentas y documentos usados por las comprobaciones deben ser ficticios.

Para aceptar una prueba se necesita el resultado observado, el comando o procedimiento que lo produce y las condiciones de ejecución. Las filas de un plan representan trabajo previsto; los resultados ejecutados se registran en evidencias y en el acta de verificación.

## 4 2 Casos funcionales y técnicos

| Caso | Procedimiento | Resultado esperado |
| --- | --- | --- |
| CP01 | Compilar y revisar tipos del backend | Finalizar sin errores |
| CP02 | Ejecutar pruebas automatizadas | Aprobar los casos registrados por el ejecutor |
| CP03 | Compilar y revisar tipos de la interfaz | Generar los archivos web sin errores |
| CP04 | Abrir catálogo por HTTPS | Mostrar tres unidades de laboratorio y fotografías |
| CP05 | Consultar /health de cada nodo | Responder 200 e identificar tres nombres distintos |
| CP06 | Consultar salud de base | Informar conexión con MySQL |
| CP07 | Repetir solicitudes por Nginx | Observar respuestas de más de una réplica |
| CP08 | Detener nodo2 y ejecutar verificador | Informar caída de nodo2 y salud de los otros dos |
| CP09 | Consultar balanceador con nodo2 detenido | Obtener atención por las instancias restantes |
| CP10 | Iniciar nodo2 y repetir verificación | Detectar reincorporación |
| CP11 | Crear cliente con intento de rol administrador | Rechazar el campo no autorizado |
| CP12 | Consultar administración sin sesión | Rechazar la operación |
| CP13 | Cotizar y confirmar reserva de laboratorio | Guardar una sola operación válida |
| CP14 | Confirmar solicitudes simultáneas para el mismo período | Rechazar las que entran en conflicto |
| CP15 | Repetir clave de idempotencia y contenido | No duplicar una reserva confirmada |
| CP16 | Consultar filtros inválidos y JSON incorrecto | Rechazar entradas sin mostrar detalles privados |

## 4 3 Prueba de recuperación

Primero se registra la salud de todos los nodos y el nodo que responde a varias solicitudes por el balanceador. Después se detiene únicamente nodo2. Se consulta nuevamente el punto de entrada y se anota si aparece algún error durante la detección. Al recuperar nodo2 se verifica que vuelva a responder y pueda atender tráfico.

La recuperación observada se limita a este escenario y a la duración registrada. Un proceso detenido y una falla de la base son escenarios diferentes. La prueba no debe denominarse disponibilidad anual comprobada.

## 4 4 Carga y criterios pendientes

La prueba de carga debe definir ruta, concurrencia, duración, volumen de datos, latencias y errores. Se comparará una instancia con el clúster y con una instancia retirada. El dimensionamiento parte de demanda pico, capacidad por nodo y factor de seguridad; se documentará el redondeo y se verificará capacidad restante después de una falla.

Una muestra corta de solicitudes sirve para verificar distribución y errores durante la demostración. No permite estimar usuarios reales simultáneos ni rendimiento comercial. Los valores no medidos se conservarán como pendientes en el acta.
