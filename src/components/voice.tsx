"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const subscribeNoop = () => () => {};

type SpeechAlternative = { transcript: string };
type SpeechResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
};
type SpeechResultList = {
  length: number;
  [index: number]: SpeechResult;
};
type SpeechResultEvent = Event & {
  resultIndex: number;
  results: SpeechResultList;
};
type SpeechErrorEvent = Event & { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function useVoiceRecognition(options: {
  lang?: string;
  onFinal?: (text: string) => void;
  onEnd?: () => void;
  onError?: (error?: string) => void;
} = {}) {
  const { lang = "pt-BR" } = options;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(options.onFinal);
  const onEndRef = useRef(options.onEnd);
  const onErrorRef = useRef(options.onError);
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(getRecognitionCtor()),
    () => false,
  );

  useEffect(() => {
    onFinalRef.current = options.onFinal;
    onEndRef.current = options.onEnd;
    onErrorRef.current = options.onError;
  }, [options.onFinal, options.onEnd, options.onError]);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        onFinalRef.current?.(finalText.trim());
      }
    };
    recognition.onend = () => {
      setListening(false);
      onEndRef.current?.();
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterim("");
      onErrorRef.current?.(event.error);
    };
    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setInterim("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      // "already started" — ignora
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  return { supported, listening, interim, start, stop };
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => isSpeechSupported(),
    () => false,
  );
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string, onEnd?: () => void): boolean {
  if (!isSpeechSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
  utterance.lang = "pt-BR";
  utterance.rate = 1;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

export function SpeakButton({
  text,
  label = "Ouvir",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        if (speak(text, () => setSpeaking(false))) setSpeaking(true);
      }}
      className={
        className ||
        "rounded-full border border-border bg-white px-3 py-1 text-xs font-medium hover:bg-muted"
      }
    >
      {speaking ? "Parar" : label}
    </button>
  );
}

export function VoiceInputButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const { supported, listening, start, stop } = useVoiceRecognition({
    onFinal: onTranscript,
  });

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-pressed={listening}
      className="rounded-full border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
    >
      {listening ? "Parar" : "Falar"}
    </button>
  );
}
