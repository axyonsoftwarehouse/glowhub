import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";
import { getDb } from "@/lib/db";
import {
  buildResetPasswordEmail,
  buildVerificationEmail,
  deliverAuthEmail,
  isAuthEmailSuppressed,
  isEmailVerificationRequired,
} from "@/lib/auth-emails";
import { APIError } from "better-auth/api";
import { recordAcceptance } from "@/lib/legal";
import * as schema from "@/db/schema";

type Auth = ReturnType<typeof buildAuth>;

function buildAuth() {
  const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: isEmailVerificationRequired(),
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deliverAuthEmail({
          to: user.email,
          email: buildResetPasswordEmail({ name: user.name, url }),
          url,
          kind: "reset_password",
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await deliverAuthEmail({
          to: user.email,
          email: buildVerificationEmail({ name: user.name, url }),
          url,
          kind: "verify_email",
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Cadastro pelo formulario exige aceite dos Termos e da Politica,
          // validado aqui no servidor (o checkbox da tela e so a interface).
          before: async (newUser, ctx) => {
            if (
              ctx?.path === "/sign-up/email" &&
              !isAuthEmailSuppressed(newUser.email) &&
              ctx.body?.acceptTerms !== true
            ) {
              throw new APIError("BAD_REQUEST", {
                code: "TERMS_NOT_ACCEPTED",
                message: "Aceite os Termos de Uso e a Política de Privacidade.",
              });
            }
          },
          after: async (createdUser, ctx) => {
            if (ctx?.path === "/sign-up/email" && ctx.body?.acceptTerms === true) {
              await recordAcceptance(createdUser.id, ctx.request?.headers ?? ctx.headers);
            }
          },
        },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    plugins: [bearer(), nextCookies()],
  });
}

let cached: Auth | undefined;

/**
 * Instancia o Better Auth sob demanda. A construcao toca o banco (getDb), entao
 * e adiada para o primeiro uso — assim o build/preview nao exige DATABASE_URL.
 */
function resolveAuth(): Auth {
  if (!cached) cached = buildAuth();
  return cached;
}

export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const instance = resolveAuth();
    const value = Reflect.get(instance as object, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, property) {
    return property in resolveAuth();
  },
});

export type Session = typeof auth.$Infer.Session;
