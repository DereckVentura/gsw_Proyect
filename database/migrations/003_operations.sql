-- Aplicar UNA vez con la cuenta de migraciones. No elimina datos del negocio.
USE autorent;

CREATE TABLE api_rate_limits (
  key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_start BIGINT UNSIGNED NOT NULL,
  requests INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hash, window_start),
  KEY idx_rate_limit_cleanup (window_start)
) ENGINE=InnoDB;

CREATE TABLE audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id INT UNSIGNED NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  action VARCHAR(60) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity_type, entity_id, id),
  FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Los puntos ficticios de la semilla no se presentan como sucursales reales.
UPDATE ubicaciones SET activo = FALSE
WHERE nombre IN ('Sucursal de demostración A', 'Punto autorizado de demostración B')
  AND direccion LIKE '%ficticia%';
