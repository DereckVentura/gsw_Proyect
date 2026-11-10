import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { DeploymentConfig } from '../config/deployment.js';
import { createRequireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import type { AuthService } from '../services/auth.service.js';
import { ApiError } from '../utils/api-error.js';

export function createMediaRouter(auth: AuthService, config: DeploymentConfig['cloudinary']) {
  const router = Router();
  router.post('/signature', createRequireAuth(auth), requireRole('administrador'), (_request, response) => {
    if (!config) throw new ApiError(503, 'MEDIA_NOT_CONFIGURED', 'La carga de nuevas fotos estará disponible al configurar el almacenamiento. Las fotos existentes siguen disponibles.');
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'autorent/vehicles';
    const signature = createHash('sha256').update(`folder=${folder}&timestamp=${timestamp}${config.apiSecret}`).digest('hex');
    response.json({ success: true, data: { cloudName: config.cloudName, apiKey: config.apiKey, timestamp, folder, signature, signatureAlgorithm: 'sha256' } });
  });
  return router;
}
