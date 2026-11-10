# Capítulo 7 Informe de calidad

## 7 1 Método y métricas

La evaluación combina revisión estática de TypeScript, pruebas automatizadas y comprobaciones de despliegue. Los archivos originales de salida se encuentran en evidencias. El acta generada para esta entrega informa el resultado y las limitaciones observadas.

El número de pruebas aprobadas mide los escenarios que ejecuta la suite; no es un porcentaje de cobertura del código. La compilación correcta demuestra consistencia de tipos y generación de archivos bajo la configuración utilizada. No certifica disponibilidad, facilidad de uso ni ausencia de defectos.

## 7 2 Mantenibilidad y decisiones

La separación entre rutas, controladores, servicios, validadores y repositorios permite localizar reglas y accesos a datos. El archivo Compose reúne la topología y evita iniciar manualmente cada instancia. Las migraciones versionadas y los archivos de dependencias fijadas ayudan a reproducir la base y las compilaciones.

La interfaz académica se obtiene de la interfaz existente y usa el mismo origen que la API al entrar por Apache. Esta adaptación reduce la dependencia del entorno Cloudflare del sitio público y permite presentar las tecnologías exigidas por la asignatura.

## 7 3 Deuda técnica y límites

Se necesita medir carga sostenida, ampliar las pruebas de interfaz y validar los manuales con una persona ajena al desarrollo. La selección de tres nodos responde al curso y no a una demanda comercial medida. Los puntos de entrada y MySQL aún no son redundantes.

La gestión de contraseñas no incluye recuperación automática y la instalación académica no incorpora pagos. Las referencias a descarga móvil del sitio original no forman parte de los entregables de ejecución de este repositorio. La edición administrativa de la interfaz debe utilizarse conforme a las funciones verificadas y a los contratos del backend.

## 7 4 Criterio de entrega

El código, sus instrucciones y los documentos deben coincidir. Las comprobaciones que fallen se deben describir como fallas y las no ejecutadas como pendientes. El material de la clase 32 permite presentar la arquitectura y la aplicación HTTPS antes del checkpoint de balanceo completo. Los resultados específicos se incluyen en el acta de esta versión.
