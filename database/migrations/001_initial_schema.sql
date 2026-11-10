-- AutoRent | Fase 2: estructura inicial de MySQL 8.4.
-- Ejecutar una sola vez. Si una tabla ya existe, detenerse y revisar el error.
-- Las conexiones de la futura API también deberán usar la zona horaria UTC.
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS autorent
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE autorent;

-- Cliente y administrador comparten esta tabla. El registro público creará
-- únicamente clientes; la API controlará los permisos y los hashes de contraseña.
CREATE TABLE usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telefono VARCHAR(25) NULL,
    rol ENUM('cliente', 'administrador') NOT NULL DEFAULT 'cliente',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email),
    CONSTRAINT chk_usuarios_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE categorias (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(80) NOT NULL,
    descripcion TEXT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categorias_nombre (nombre),
    CONSTRAINT chk_categorias_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE marcas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(80) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marcas_nombre (nombre),
    CONSTRAINT chk_marcas_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE modelos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    marca_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_modelos_marca_nombre (marca_id, nombre),
    CONSTRAINT fk_modelos_marca FOREIGN KEY (marca_id)
        REFERENCES marcas (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE ubicaciones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    tipo ENUM('sucursal', 'punto_autorizado') NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    latitud DECIMAL(10, 7) NOT NULL,
    longitud DECIMAL(10, 7) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    CONSTRAINT chk_ubicaciones_latitud CHECK (latitud BETWEEN -90 AND 90),
    CONSTRAINT chk_ubicaciones_longitud CHECK (longitud BETWEEN -180 AND 180),
    CONSTRAINT chk_ubicaciones_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- El estado operativo no indica disponibilidad por fechas.
-- Para retirar un vehículo se usará 'inactivo', conservando su historial.
CREATE TABLE vehiculos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    placa VARCHAR(20) NOT NULL,
    categoria_id INT UNSIGNED NOT NULL,
    modelo_id INT UNSIGNED NOT NULL,
    ubicacion_actual_id INT UNSIGNED NOT NULL,
    anio SMALLINT UNSIGNED NOT NULL,
    kilometraje INT UNSIGNED NOT NULL DEFAULT 0,
    precio_dia DECIMAL(10, 2) NOT NULL,
    estado_operativo ENUM('operativo', 'mantenimiento', 'inactivo')
        NOT NULL DEFAULT 'operativo',
    descripcion TEXT NULL,
    imagen_url VARCHAR(2048) NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_vehiculos_placa (placa),
    KEY idx_vehiculos_categoria (categoria_id),
    KEY idx_vehiculos_modelo (modelo_id),
    KEY idx_vehiculos_ubicacion (ubicacion_actual_id),
    CONSTRAINT chk_vehiculos_anio CHECK (anio >= 1886),
    CONSTRAINT chk_vehiculos_kilometraje CHECK (kilometraje >= 0),
    CONSTRAINT chk_vehiculos_precio CHECK (precio_dia >= 0),
    CONSTRAINT fk_vehiculos_categoria FOREIGN KEY (categoria_id)
        REFERENCES categorias (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vehiculos_modelo FOREIGN KEY (modelo_id)
        REFERENCES modelos (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vehiculos_ubicacion FOREIGN KEY (ubicacion_actual_id)
        REFERENCES ubicaciones (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Reglas acordadas para el MVP:
-- 1. La reserva queda confirmada automáticamente si hay disponibilidad.
-- 2. La API calculará bloques de 24 horas, redondeando hacia arriba.
-- 3. El cliente puede cancelar gratuitamente solo antes de inicio_utc.
-- La API comprobará rol, transición de estado, cancelación y solapamientos.
-- Para impedir dos reservas simultáneas deberá bloquear la fila del vehículo
-- dentro de una transacción antes de comprobar y guardar el período.
CREATE TABLE reservas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(24) NOT NULL,
    cliente_id INT UNSIGNED NOT NULL,
    vehiculo_id INT UNSIGNED NOT NULL,
    entrega_id INT UNSIGNED NOT NULL,
    devolucion_id INT UNSIGNED NOT NULL,
    inicio_utc DATETIME(6) NOT NULL,
    fin_utc DATETIME(6) NOT NULL,
    estado ENUM('confirmada', 'en_curso', 'completada', 'cancelada', 'no_presentado')
        NOT NULL DEFAULT 'confirmada',
    precio_dia_aplicado DECIMAL(10, 2) NOT NULL,
    unidades_cobradas INT UNSIGNED NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    moneda CHAR(3) NOT NULL DEFAULT 'USD',
    cancelada_en DATETIME(6) NULL,
    motivo_cancelacion VARCHAR(500) NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_reservas_codigo (codigo),
    KEY idx_reservas_disponibilidad (vehiculo_id, estado, inicio_utc, fin_utc),
    KEY idx_reservas_cliente_historial (cliente_id, inicio_utc, id),
    KEY idx_reservas_entrega (entrega_id),
    KEY idx_reservas_devolucion (devolucion_id),
    CONSTRAINT chk_reservas_periodo CHECK (fin_utc > inicio_utc),
    CONSTRAINT chk_reservas_precio CHECK (precio_dia_aplicado >= 0),
    CONSTRAINT chk_reservas_unidades CHECK (unidades_cobradas >= 1),
    CONSTRAINT chk_reservas_total CHECK (
        total >= 0 AND total = precio_dia_aplicado * unidades_cobradas
    ),
    CONSTRAINT chk_reservas_cancelacion CHECK (
        (estado = 'cancelada' AND cancelada_en IS NOT NULL)
        OR
        (estado <> 'cancelada' AND cancelada_en IS NULL AND motivo_cancelacion IS NULL)
    ),
    CONSTRAINT fk_reservas_cliente FOREIGN KEY (cliente_id)
        REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservas_vehiculo FOREIGN KEY (vehiculo_id)
        REFERENCES vehiculos (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservas_entrega FOREIGN KEY (entrega_id)
        REFERENCES ubicaciones (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservas_devolucion FOREIGN KEY (devolucion_id)
        REFERENCES ubicaciones (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Una reserva puede originar como máximo un alquiler.
-- Los tres datos de cierre se registran juntos al recibir el vehículo.
CREATE TABLE alquileres (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    reserva_id INT UNSIGNED NOT NULL,
    salida_real_utc DATETIME(6) NOT NULL,
    devolucion_real_utc DATETIME(6) NULL,
    km_salida INT UNSIGNED NOT NULL,
    km_regreso INT UNSIGNED NULL,
    entregado_por INT UNSIGNED NOT NULL,
    recibido_por INT UNSIGNED NULL,
    observaciones_salida TEXT NULL,
    observaciones_devolucion TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_alquileres_reserva (reserva_id),
    KEY idx_alquileres_entregado_por (entregado_por),
    KEY idx_alquileres_recibido_por (recibido_por),
    CONSTRAINT chk_alquileres_cierre CHECK (
        (devolucion_real_utc IS NULL AND km_regreso IS NULL AND recibido_por IS NULL)
        OR
        (devolucion_real_utc IS NOT NULL AND km_regreso IS NOT NULL AND recibido_por IS NOT NULL)
    ),
    CONSTRAINT chk_alquileres_fechas CHECK (
        devolucion_real_utc IS NULL OR devolucion_real_utc >= salida_real_utc
    ),
    CONSTRAINT chk_alquileres_kilometraje CHECK (
        km_salida >= 0 AND (km_regreso IS NULL OR km_regreso >= km_salida)
    ),
    CONSTRAINT fk_alquileres_reserva FOREIGN KEY (reserva_id)
        REFERENCES reservas (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_alquileres_entregado_por FOREIGN KEY (entregado_por)
        REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_alquileres_recibido_por FOREIGN KEY (recibido_por)
        REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE notificaciones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT UNSIGNED NOT NULL,
    reserva_id INT UNSIGNED NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    creada_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    leida_en DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_notificaciones_usuario_lectura (usuario_id, leida_en, creada_en),
    KEY idx_notificaciones_reserva (reserva_id),
    CONSTRAINT chk_notificaciones_lectura CHECK (
        leida_en IS NULL OR leida_en >= creada_en
    ),
    CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_notificaciones_reserva FOREIGN KEY (reserva_id)
        REFERENCES reservas (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
