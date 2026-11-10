CREATE TABLE driver_documents (
  id CHAR(36) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  holder VARCHAR(180) NOT NULL,
  country VARCHAR(80) NOT NULL,
  expires_on DATE NOT NULL,
  front_image MEDIUMBLOB NOT NULL,
  front_type VARCHAR(20) NOT NULL,
  back_image MEDIUMBLOB NOT NULL,
  back_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  INDEX driver_documents_user_created (user_id, created_at)
);
ALTER TABLE reservas ADD documento_id CHAR(36) NULL;
ALTER TABLE reservas ADD CONSTRAINT reservas_driver_document_fk FOREIGN KEY (documento_id) REFERENCES driver_documents(id);
