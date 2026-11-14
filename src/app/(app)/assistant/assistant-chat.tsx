"use client";

import { useState, useTransition } from "react";
import { askAssistantAction } from "./actions";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  greeting?: boolean;
};

const EXAMPLES = [
  "Como está a minha agenda de hoje?",
  "Quanto eu recebi hoje e quanto tenho a receber?",
  "Quais serviços eu tenho cadastrados e quanto custam?",
  "Quantos clientes ativos tenho e quais agendamentos vêm por aí?",
];

export function AssistantChat({
  tenantName,
  disabled,
}: {
  tenantName: string;
  disabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      greeting: true,
      content: `Oi! Sou o assistente do GlowHub. Posso responder perguntas sobre a agenda, clientes, serviços e finanças de ${tenantName}. O que você quer saber?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [nextId, setNextId] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(question: string) {
    const text = question.trim();
    if (!text || pending || disabled) return;

    setError(null);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: nextId, role: "user", content: text },
    ]);
    setNextId((id) => id + 1);

    const history = messages
      .filter((message) => !message.greeting)
      .map((message) => ({ role: message.role, content: message.content }));

    startTransition(async () => {
      const result = await askAssistantAction(text, history);
      if (result.status === "success") {
        setMessages((current) => [
          ...current,
          { id: nextId + 1, role: "assistant", content: result.answer },
        ]);
      } else {
        setError(result.message);
        setMessages((current) => [
          ...current,
          {
            id: nextId + 1,
            role: "assistant",
            content: result.message,
            error: true,
          },
        ]);
      }
      setNextId((id) => id + 2);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white/70">
      <div className="max-h-[60vh] min-h-[280px] space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground"
                : `mr-auto max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm ${
                    message.error
                      ? "border border-red-200 bg-red-50 text-red-700"
                      : "bg-muted text-foreground"
                  }`
            }
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}

        {pending && (
          <p className="mr-auto text-xs text-foreground/60">Consultando...</p>
        )}
      </div>

      {messages.length <= 1 && !disabled && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => send(example)}
              className="rounded-full border border-border bg-white px-3 py-1 text-xs text-foreground/70 hover:bg-muted"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={disabled ? "Assistente indisponível" : "Escreva sua pergunta..."}
          disabled={disabled || pending}
          maxLength={2000}
          aria-label="Pergunta para o assistente"
          className="w-full rounded-full border border-border bg-white px-4 py-2 text-sm outline-none focus:border-brand disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || pending || !input.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "..." : "Enviar"}
        </button>
      </form>

      {error && (
        <p className="px-4 pb-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <p className="border-t border-border px-4 py-2 text-[11px] text-foreground/50">
        Respostas geradas por IA a partir dos dados da sua empresa. Confira as
        informações antes de tomar decisões.
      </p>
    </div>
  );
}
