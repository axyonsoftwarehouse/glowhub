import type { Metadata } from "next";
import Link from "next/link";
import { isDemoLoginEnabled } from "@/lib/app-env";
import { PLAN_IDS, PLANS, TRIAL_DAYS, formatPrice, limitLabel } from "@/lib/billing/plans";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const SIGNUP_HREF = "/login?modo=cadastro";

const features = [
  {
    title: "Agenda sem conflito",
    body: "Horários por profissional e filial, bloqueio de encaixe duplo, check-in e lembretes automáticos por e-mail.",
  },
  {
    title: "Agendamento online",
    body: "Uma página própria para seus clientes marcarem sozinhos, 24 horas por dia, só nos horários livres.",
  },
  {
    title: "Comanda e caixa",
    body: "Serviços, produtos, gorjeta e cupons na mesma comanda. Pix e cartão por link de pagamento, com baixa automática.",
  },
  {
    title: "Clientes que voltam",
    body: "Histórico completo, aniversários, clientes em risco, pacotes, assinaturas, gift cards e programa de pontos.",
  },
  {
    title: "Estoque e lucro de verdade",
    body: "Ficha técnica dos serviços, baixa de insumos, custo médio, comissões e DRE para saber o que realmente dá lucro.",
  },
  {
    title: "Assistente com IA",
    body: "Pergunte como foi a semana, peça mensagens para WhatsApp e promoções, ou envie um comprovante para lançar a cobrança.",
  },
];

const steps = [
  {
    title: "Crie sua conta",
    body: `Cadastro em poucos minutos, sem cartão. São ${TRIAL_DAYS} dias grátis com todos os recursos.`,
  },
  {
    title: "Monte seu catálogo",
    body: "Serviços, preços, duração e equipe. O onboarding guia cada passo, inclusive para quem atende sozinho.",
  },
  {
    title: "Comece a atender",
    body: "Divulgue seu link de agendamento e acompanhe agenda, caixa e clientes pelo computador ou celular.",
  },
];

const faq = [
  {
    q: "Preciso de cartão de crédito para testar?",
    a: `Não. O teste de ${TRIAL_DAYS} dias é gratuito e libera todos os recursos. Você escolhe um plano só se quiser continuar.`,
  },
  {
    q: "Funciona no celular?",
    a: "Sim. O painel foi pensado para o celular, com navegação inferior e um resumo do dia para quem atende sozinho.",
  },
  {
    q: "Tenho mais de uma unidade. Serve para mim?",
    a: "Serve. Cada filial tem agenda, horários, preços e equipe próprios, e você acompanha tudo em um só painel.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Os dados de cada empresa ficam isolados no banco de dados e o tratamento segue a LGPD, conforme nossa Política de Privacidade.",
  },
  {
    q: "Posso trocar de plano ou cancelar?",
    a: "Pode, a qualquer momento, pela tela de assinatura do painel. Não há fidelidade.",
  },
];

function demoHref(): string | null {
  const url = process.env.NEXT_PUBLIC_DEMO_URL;
  if (url) return url;
  return isDemoLoginEnabled() ? "/login" : null;
}

function Logo() {
  return (
    <span className="text-lg font-semibold tracking-tight">
      Glow<span className="text-brand">Hub</span>
    </span>
  );
}

const primaryButton =
  "inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground transition hover:opacity-90";
const secondaryButton =
  "inline-flex items-center justify-center rounded-full border border-border bg-white/60 px-6 py-3 font-medium transition hover:bg-white";

export default function Home() {
  const demo = demoHref();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="GlowHub, página inicial">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-2 text-sm sm:gap-4">
          <a href="#recursos" className="hidden px-2 py-1 hover:text-brand sm:inline">
            Recursos
          </a>
          <a href="#planos" className="hidden px-2 py-1 hover:text-brand sm:inline">
            Planos
          </a>
          <Link href="/login" className="px-2 py-1 font-medium hover:text-brand">
            Entrar
          </Link>
          <Link
            href={SIGNUP_HREF}
            className="rounded-full bg-brand px-4 py-2 font-medium text-brand-foreground transition hover:opacity-90"
          >
            Teste grátis
          </Link>
        </nav>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-widest text-brand">
              Para salões, barbearias, estética e spas
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Sua agenda cheia e o caixa em dia, no mesmo lugar.
            </h1>
            <p className="mt-6 text-lg text-foreground/70 sm:text-xl">
              O GlowHub organiza agendamentos, comandas, clientes e financeiro do seu negócio de
              beleza, do profissional autônomo à rede com várias unidades.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={SIGNUP_HREF} className={primaryButton}>
                Começar {TRIAL_DAYS} dias grátis
              </Link>
              {demo ? (
                <Link href={demo} className={secondaryButton}>
                  Ver demonstração
                </Link>
              ) : (
                <a href="#planos" className={secondaryButton}>
                  Ver planos
                </a>
              )}
            </div>
            <p className="mt-4 text-sm text-foreground/60">
              Sem cartão de crédito. Cancele quando quiser.
            </p>
          </div>
        </section>

        <section
          id="recursos"
          aria-labelledby="recursos-titulo"
          className="scroll-mt-8 border-y border-border bg-muted/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="recursos-titulo" className="text-3xl font-semibold tracking-tight">
              Tudo o que o dia a dia pede
            </h2>
            <p className="mt-3 max-w-2xl text-foreground/70">
              Menos planilha, caderno e mensagem perdida. Mais tempo para atender.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="rounded-2xl border border-border bg-white/70 p-6">
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="passos-titulo" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="passos-titulo" className="text-3xl font-semibold tracking-tight">
            Comece hoje, em três passos
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-brand font-semibold text-brand-foreground"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="planos"
          aria-labelledby="planos-titulo"
          className="scroll-mt-8 border-y border-border bg-muted/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="planos-titulo" className="text-3xl font-semibold tracking-tight">
              Planos simples, sem fidelidade
            </h2>
            <p className="mt-3 max-w-2xl text-foreground/70">
              Todos os planos incluem todos os recursos. O que muda é o tamanho da equipe e o número de
              unidades.
            </p>
            <ul className="mt-10 grid gap-4 lg:grid-cols-3">
              {PLAN_IDS.map((id) => {
                const plan = PLANS[id];
                const highlight = id === "equipe";
                const { professionals, branches, members } = plan.limits;
                return (
                  <li
                    key={id}
                    className={`flex flex-col rounded-2xl border bg-white/80 p-6 ${
                      highlight ? "border-brand shadow-lg shadow-brand/10" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {highlight && (
                        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                          Mais escolhido
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground/70">{plan.description}</p>
                    <p className="mt-6">
                      <span className="text-3xl font-semibold">{formatPrice(plan.priceCents)}</span>
                      <span className="text-foreground/60">/mês</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-2 text-sm">
                      <li>
                        {professionals === null
                          ? "Profissionais ilimitados"
                          : `Até ${limitLabel("professionals", professionals)}`}
                      </li>
                      <li>{branches === null ? "Filiais ilimitadas" : `Até ${limitLabel("branches", branches)}`}</li>
                      <li>
                        {members === null
                          ? "Usuários do painel ilimitados"
                          : `Até ${limitLabel("members", members)} no painel`}
                      </li>
                      <li>Agendamento online, financeiro e assistente com IA</li>
                    </ul>
                    <Link
                      href={SIGNUP_HREF}
                      className={`mt-8 ${highlight ? primaryButton : secondaryButton}`}
                    >
                      Testar {TRIAL_DAYS} dias grátis
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section aria-labelledby="faq-titulo" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 id="faq-titulo" className="text-3xl font-semibold tracking-tight">
            Perguntas frequentes
          </h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {faq.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="text-xl leading-none text-brand transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-foreground/70">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl bg-brand px-6 py-12 text-center text-brand-foreground sm:px-12">
            <h2 className="text-3xl font-semibold tracking-tight">Pronto para organizar seu negócio?</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-foreground/85">
              Crie sua conta agora e use tudo por {TRIAL_DAYS} dias, sem compromisso.
            </p>
            <Link
              href={SIGNUP_HREF}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-medium text-brand transition hover:opacity-90"
            >
              Começar grátis
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-foreground/70 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-1">Gestão para beleza e estética.</p>
          </div>
          <nav aria-label="Documentos legais" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/termos" className="hover:underline">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:underline">
              Política de Privacidade
            </Link>
            <Link href="/login" className="hover:underline">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
