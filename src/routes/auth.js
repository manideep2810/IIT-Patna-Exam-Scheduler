import { Router } from 'express';

import {
  changePasswordController,
  currentUserController,
  loginController,
  logoutController
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const authRouter = Router();

authRouter.post('/login', loginController);
authRouter.get('/me', authenticate, currentUserController);
authRouter.post('/change-password', authenticate, changePasswordController);
authRouter.post('/logout', authenticate, logoutController);

export default authRouter;
