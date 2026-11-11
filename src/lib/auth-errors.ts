// Mensagens em pt-BR para os codigos de erro do Better Auth. O texto original
// vem em ingles; a interface mostra sempre a versao traduzida.

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail.",
  EMAIL_NOT_VERIFIED:
    "Confirme seu e-mail antes de entrar. Enviamos um novo link para sua caixa de entrada.",
  INVALID_TOKEN: "Este link é inválido ou expirou. Peça um novo.",
  TOKEN_EXPIRED: "Este link expirou. Peça um novo.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
};

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.status === 429) return "Muitas tentativas. Aguarde e tente novamente.";
  return (error.code && MESSAGES[error.code]) || fallback;
}
