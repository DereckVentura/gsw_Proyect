# Documentación del proyecto AutoRent

## Introducción

AutoRent es una aplicación para consultar y reservar vehículos de alquiler de Rent a Car Molina, con atención en La Unión y San Miguel. El proyecto de Gestión de Servidores Web aplica los contenidos de la asignatura a una aplicación existente: servidor web con HTTPS, contenedores, tres instancias de la API, base compartida y verificación de salud.

Este documento reúne los requisitos, el análisis funcional, el diseño, el plan de pruebas, los manuales, los informes de calidad y seguridad y el plan formativo. La entrega está fechada el 11 de noviembre de 2026. El tema de alquiler y el equipo de cuatro personas cuentan con aprobación del docente, según confirmación del equipo.

## Identificación y control de versión

| Campo | Valor |
| --- | --- |
| Institución | Universidad de Oriente |
| Facultad | Ingeniería y Arquitectura |
| Carrera | Ingeniería en Desarrollo de Software |
| Materia | Gestión de Servidores Web |
| Docente | Ing. Alberto Turcios Ortez |
| Proyecto | AutoRent para alquiler de vehículos |
| Versión documental | 1.0 del 11 de noviembre de 2026 |
| Repositorio | https://github.com/DereckVentura/gsw_Proyect |

Responsables: Dereck Enrique Ventura Benítez, Andersson Wilfredo Vargas Reyes, Luis Román Lino Merino y Edwin David Díaz Acosta.

## Problema y justificación

El negocio necesita presentar sus unidades y organizar las reservas en un canal común. La aplicación permite consultar fotografías y tarifas, seleccionar fechas y verificar disponibilidad antes de confirmar. La consistencia resulta esencial: una solicitud atendida por otro servidor debe consultar el mismo inventario y las mismas reservas.

Una sola instancia de la API deja de responder cuando se detiene su proceso. La réplica de tres instancias permite distribuir las solicitudes y estudiar qué ocurre al retirar una de ellas. La base compartida conserva el estado de negocio; las transacciones existentes controlan los conflictos entre reservas.

## Objetivos

El objetivo general es integrar AutoRent con una infraestructura local reproducible que demuestre HTTPS, contenedores y continuidad de la API ante la caída de una réplica.

Los objetivos específicos son empaquetar la API Express/TypeScript, servir la interfaz con Apache y HTTPS, distribuir solicitudes con Nginx, comprobar tres nodos y registrar los resultados y procedimientos en el repositorio.

## Alcance y fuentes de la entrega

El material de Gestión de Servidores Web recibido llega hasta la clase 32. La clase 32 solicita arquitectura con tres nodos y balanceador, repositorio y servidor HTTPS integrado con el contenedor para el checkpoint siguiente. El balanceo completo pertenece a un checkpoint posterior; su preparación se incluye como avance cuando pueda verificarse.

El documento Documentación de Software I orienta la cobertura de los entregables de software y la estructura del manual. Sus referencias IEEE se utilizan como guía académica de organización, sin afirmar una certificación de conformidad. El Segundo Avance de Investigación sirve como referencia de portada, capítulos, tablas, figuras y referencias. El tema de brecha digital y los datos de esa investigación pertenecen a otra asignatura y no forman parte de los resultados de AutoRent.

## Correspondencia de los entregables

| Entregable del material de Software I | Ubicación en esta entrega |
| --- | --- |
| Requisitos | Capítulo 1 |
| Análisis funcional | Capítulo 2 |
| Diseño de software | Capítulo 3 y diagrama de arquitectura |
| Plan de pruebas | Capítulo 4 y carpeta evidencias |
| Código fuente | backend, web, database, infra y scripts |
| Manual de usuario | Capítulo 5 y manual corto independiente |
| Manual de instalación | Capítulo 6 |
| Informe de calidad | Capítulo 7 |
| Informe de seguridad | Capítulo 8 |
| Plan formativo | Capítulo 9 y guion para cuatro integrantes |
