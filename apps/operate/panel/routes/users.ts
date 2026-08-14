/** Composes administrator and self-service user lifecycle routes. */
import express from 'express';
import { registerUserManagementRoutes } from './users/managementRoutes';
import { registerPasswordRoutes } from './users/passwordRoutes';
import { registerUserPageRoutes } from './users/pageRoutes';

const router = express.Router();

registerUserPageRoutes(router);
registerPasswordRoutes(router);
registerUserManagementRoutes(router);

export default router;
