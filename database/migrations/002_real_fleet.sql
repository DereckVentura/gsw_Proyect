-- Aplicar UNA vez sobre autorent con una cuenta de migraciones (por ejemplo root).
-- Conserva vehículos, usuarios, reservas e historial existentes.
USE autorent;

ALTER TABLE vehiculos
    MODIFY placa VARCHAR(20) NULL,
    MODIFY ubicacion_actual_id INT UNSIGNED NULL,
    MODIFY kilometraje INT UNSIGNED NULL DEFAULT NULL,
    MODIFY precio_dia DECIMAL(10, 2) NULL,
    ADD COLUMN codigo_interno VARCHAR(64) NULL,
    ADD COLUMN publicado BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN ficha JSON NULL,
    ADD UNIQUE KEY uq_vehiculos_codigo_interno (codigo_interno),
    ADD CONSTRAINT chk_vehiculos_publicado CHECK (publicado IN (0, 1));

-- No se inventa un precio de cero ni un kilometraje para los datos pendientes.
-- La ficha distingue las características de la unidad de las referencias del modelo.
