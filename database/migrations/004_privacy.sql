-- Datos públicos editables, constancias inmutables y solicitudes privadas.
CREATE TABLE IF NOT EXISTS business_content (
  id TINYINT UNSIGNED PRIMARY KEY,
  contenido JSON NOT NULL,
  actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  reserva_id INT UNSIGNED NULL,
  contexto ENUM('registro','reserva') NOT NULL,
  version CHAR(64) NOT NULL,
  documentos JSON NOT NULL,
  aceptado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_legal_usuario (usuario_id, id),
  CONSTRAINT fk_legal_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_legal_reserva FOREIGN KEY (reserva_id) REFERENCES reservas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  tipo ENUM('acceso','rectificacion','supresion','oposicion','portabilidad','olvido','limitacion','retiro_consentimiento','reclamo') NOT NULL,
  detalle VARCHAR(2000) NOT NULL,
  estado ENUM('recibida','en_revision','respondida') NOT NULL DEFAULT 'recibida',
  respuesta VARCHAR(3000) NULL,
  respondida_por INT UNSIGNED NULL,
  creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_privacy_usuario (usuario_id, id),
  INDEX idx_privacy_estado (estado, id),
  CONSTRAINT fk_privacy_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_privacy_admin FOREIGN KEY (respondida_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;
