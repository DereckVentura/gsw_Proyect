# Verificación local — Fase 2

Fecha: 10 de noviembre de 2026, El Salvador. Verificación ejecutada después de construir las imágenes y levantar la arquitectura de esta entrega.

| Comprobación | Resultado observado |
| --- | --- |
| `docker compose config --quiet` | Configuración válida |
| Construcción de API y Apache | Correcta |
| `docker compose exec -T apache httpd -t` | `Syntax OK` |
| Apache | 2.4.69, OpenSSL 3.5.9 |
| Servicios activos | Apache, una API Express y MySQL; inicializador finaliza con código 0 |
| Puertos del host | 8443 HTTPS y 8088 redirección HTTP, solo en 127.0.0.1 |
| API y MySQL | Sin puertos publicados al host |
| `GET https://localhost:8443/` | 200, HTML de AutoRent |
| `GET /api/vehiculos` | 200, catálogo de 3 vehículos desde MySQL |
| `GET /api/vehiculos/1` | 200, vehículo con identificador 1 |
| `GET /api/vehiculos?precio_max=60` | 200, tarifas dentro del límite |
| `GET /api/v1/vehicles` | 200, API utilizada por la interfaz |
| `GET /api/v1/health/database` | 200, conexión MySQL comprobada |
| `GET http://localhost:8088/` | 301 hacia `https://localhost:8443/` |
| Tipos y compilación backend/web | Correctos |
| Pruebas existentes de backend | 96 aprobadas, 0 fallos |
| Prueba adicional de Clase 19 | 1 aprobada: filtros, JSON, detalle ausente 404, parámetro inválido 400 e identidad de AutoRent |
| Secretos y llaves | `.env` y `.local/` excluidos de Git |

Las peticiones de `scripts/verificar-fase2.ps1` utilizaron la validación TLS normal de Windows, con el certificado local previamente registrado como confiable. No se utilizaron opciones para ignorar errores TLS. Esto demuestra la comprobación técnica de confianza en este equipo; **queda pendiente la captura visual del navegador** indicada en [README de evidencias](README.md).

## Misma petición en las dos capas

Extractos reales de `docker compose logs --tail 10 apache api`:

```text
Apache:
"GET /api/vehiculos HTTP/1.1" 200 6309
"GET /api/vehiculos/1 HTTP/1.1" 200 2056
"GET /api/vehiculos?precio_max=60 HTTP/1.1" 200 6309

Express:
{"method":"GET","path":"/api/vehiculos","status":200}
{"method":"GET","path":"/api/vehiculos/1","status":200}
{"method":"GET","path":"/api/vehiculos?precio_max=60","status":200}
```

## Repetir la verificación

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verificar-fase2.ps1
```

Este registro corresponde a la arquitectura de Fase 2. Los registros anteriores de clúster y Nginx se conservaron únicamente como material local para futuras fases.
