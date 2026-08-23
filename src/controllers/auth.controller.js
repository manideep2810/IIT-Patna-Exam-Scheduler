import { changePassword, login } from '../services/auth.service.js';

export async function loginController(request, response) {
  const result = await login(request.body?.email, request.body?.password);
  response.status(200).json(result);
}

export function currentUserController(request, response) {
  response.status(200).json({ user: request.user });
}

export async function changePasswordController(request, response) {
  const user = await changePassword(
    request.user.id,
    request.body?.currentPassword,
    request.body?.newPassword
  );

  response.status(200).json({ user });
}

export function logoutController(_request, response) {
  response.status(204).send();
}
