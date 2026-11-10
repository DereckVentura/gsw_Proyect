# Capítulo 1 Requisitos del sistema

## 1 1 Usuarios y restricciones

El visitante consulta la flota, las ubicaciones y la información del negocio. El cliente registrado puede cotizar, aportar el documento requerido y gestionar sus reservas. La administración modifica información de las unidades y realiza operaciones autorizadas de alquiler. El operador técnico instala los servicios y revisa su estado.

La demostración usa una base independiente llamada autorent_gsw. Sus ubicaciones de entrega y el kilometraje de 50000 asignado a las unidades son datos ilustrativos de laboratorio. No certifican el kilometraje ni las condiciones comerciales de las unidades reales. Las licencias de prueba deben ser imágenes ficticias claramente identificadas.

## 1 2 Requisitos funcionales

| ID | Requisito | Condición de aceptación |
| --- | --- | --- |
| RF01 | Consultar vehículos y fotografías | Mostrar la flota que la base publica y admitir filtros válidos |
| RF02 | Consultar una unidad | Presentar marca, modelo, año, tarifa y características disponibles |
| RF03 | Registrar y autenticar clientes | Crear exclusivamente cuentas cliente y rechazar acceso inválido |
| RF04 | Consultar disponibilidad | Mostrar períodos ocupados y rechazar fechas incorrectas |
| RF05 | Cotizar alquiler | Calcular bloques de 24 horas y total en el servidor |
| RF06 | Adjuntar licencia | Exigir ambas imágenes, consentimiento y vigencia válida |
| RF07 | Confirmar reserva | Validar fechas, tarifa, documento y consentimiento; impedir solapamientos |
| RF08 | Consultar historial y cancelar | Limitar el acceso a registros autorizados y respetar el estado de la reserva |
| RF09 | Administrar datos autorizados | Exigir rol administrador vigente para operaciones restringidas |
| RF10 | Consultar salud | Identificar cada nodo y verificar la conexión con MySQL |
| RF11 | Detectar un nodo detenido | El verificador debe señalar su caída y posterior recuperación |
| RF12 | Reproducir la instalación | Iniciar la infraestructura desde el código y las instrucciones del repositorio |

## 1 3 Requisitos no funcionales

| ID | Requisito | Criterio de verificación |
| --- | --- | --- |
| RNF01 | Integración del curso | Express/TypeScript, Apache o IIS, HTTPS, Docker Compose y Nginx |
| RNF02 | Réplicas consistentes | Tres nodos construidos desde la misma imagen y conectados a la misma base |
| RNF03 | Cifrado de entrada | HTTPS con certificado local entre navegador y Apache y entre Apache y Nginx |
| RNF04 | Aislamiento del laboratorio | Base sin puerto publicado y diagnósticos accesibles solo desde el equipo local |
| RNF05 | Menor privilegio | API como usuario node y cuenta MySQL limitada a operaciones de datos |
| RNF06 | Persistencia | Reservas y cuentas en volumen MySQL persistente, independientes de la vida de una API |
| RNF07 | Trazabilidad | Versiones, resultados, configuraciones y procedimientos registrados |
| RNF08 | Disponibilidad | Meta de diseño de 99.9 %; registrar resultados sin inferir disponibilidad anual de una prueba breve |

La latencia, el número de usuarios simultáneos y la capacidad comercial no se establecen como resultados medidos hasta ejecutar una prueba de carga con duración y condiciones documentadas. Los tres nodos satisfacen el diseño académico de la clase 32; el dimensionamiento comercial queda sujeto a medición.

## 1 4 Casos de uso principales

**CU01 Consultar la flota.** El visitante abre AutoRent, revisa las unidades y aplica filtros. La consulta no requiere iniciar sesión. Si la API no responde, la interfaz muestra un mensaje y el visitante puede reintentar.

**CU02 Reservar una unidad.** El cliente inicia sesión, escoge vehículo y fechas, solicita la cotización, adjunta la licencia ficticia en el laboratorio y acepta los documentos vigentes. El servidor confirma si la unidad sigue libre y registra la operación en MySQL. Un conflicto produce un aviso y exige seleccionar otro período.

**CU03 Revisar el clúster.** El operador consulta salud de los tres nodos, detiene nodo2 y repite el verificador. Después inicia el nodo y confirma su recuperación. La continuidad por Nginx se comprueba con solicitudes reales al balanceador.

## 1 5 Trazabilidad

RF01 y RF02 se relacionan con las rutas de vehículos; RF03, con acceso; RF04 a RF08, con reservas y documentos; RF09, con los permisos de administración; RF10 y RF11, con salud y operación del clúster. Los casos del capítulo 4 verifican estos requisitos. La revisión de tipos y las pruebas automáticas apoyan RNF05 y RNF07; no reemplazan las pruebas de despliegue de RNF01 a RNF04.
