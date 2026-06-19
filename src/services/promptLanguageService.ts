export type PromptLanguage = "Vietnamese" | "English";

export type LanguageSignal = {
  label: string;
  text?: string | null;
};

type LanguageScores = {
  vietnamese: number;
  english: number;
};

type PromptLanguageDecision = {
  language: PromptLanguage;
  reason: string;
};

const VIETNAMESE_CHAR_PATTERN =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;
const EXPLICIT_VIETNAMESE_PATTERN = /\b(?:ti[eế]ng\s*vi[eệ]t|vietnamese)\b/iu;
const EXPLICIT_ENGLISH_PATTERN = /\b(?:ti[eế]ng\s*anh|english)\b/iu;

const COMMON_VIETNAMESE_WORDS = new Set([
  "anh",
  "các",
  "cho",
  "chúng",
  "cô",
  "của",
  "đang",
  "đã",
  "đến",
  "được",
  "em",
  "khi",
  "không",
  "là",
  "một",
  "này",
  "nếu",
  "người",
  "nhưng",
  "những",
  "rằng",
  "sau",
  "thì",
  "trong",
  "trước",
  "tôi",
  "và",
  "vẫn",
  "với",
]);

const COMMON_ENGLISH_WORDS = new Set([
  "about",
  "and",
  "are",
  "can",
  "could",
  "chapter",
  "describe",
  "for",
  "from",
  "have",
  "has",
  "had",
  "into",
  "not",
  "rewrite",
  "should",
  "story",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "with",
  "will",
  "would",
  "write",
  "you",
  "your",
]);

function tokenize(text: string) {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

function scoreText(text: string): LanguageScores {
  const vietnameseMatches = text.match(
    /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/giu,
  );
  const tokens = tokenize(text);

  let vietnamese = vietnameseMatches?.length ? Math.min(20, vietnameseMatches.length * 2) : 0;
  let english = 0;

  for (const token of tokens) {
    if (VIETNAMESE_CHAR_PATTERN.test(token)) {
      vietnamese += 2;
    }

    if (COMMON_VIETNAMESE_WORDS.has(token)) {
      vietnamese += 3;
    }

    if (COMMON_ENGLISH_WORDS.has(token)) {
      english += 2;
    }
  }

  return { vietnamese, english };
}

function detectExplicitLanguage(text: string): PromptLanguage | null {
  const wantsVietnamese = EXPLICIT_VIETNAMESE_PATTERN.test(text);
  const wantsEnglish = EXPLICIT_ENGLISH_PATTERN.test(text);

  if (wantsVietnamese === wantsEnglish) {
    return null;
  }

  return wantsVietnamese ? "Vietnamese" : "English";
}

function chooseLanguage(scores: LanguageScores, allowWeakSignal = false): PromptLanguage | null {
  const gap = Math.abs(scores.vietnamese - scores.english);
  const strongestScore = Math.max(scores.vietnamese, scores.english);

  if (strongestScore === 0) {
    return null;
  }

  if (gap >= 3 || (allowWeakSignal && gap >= 1)) {
    return scores.vietnamese > scores.english ? "Vietnamese" : "English";
  }

  return null;
}

function aggregateScores(signals: LanguageSignal[]) {
  return signals.reduce<LanguageScores>(
    (totals, signal) => {
      const text = signal.text?.trim();
      if (!text) {
        return totals;
      }

      const scores = scoreText(text);
      totals.vietnamese += scores.vietnamese;
      totals.english += scores.english;
      return totals;
    },
    { vietnamese: 0, english: 0 },
  );
}

function formatSignalLabels(signals: LanguageSignal[]) {
  return signals.map((signal) => signal.label).join(", ");
}

function inferPromptLanguage(taskSignals: LanguageSignal[], storySignals: LanguageSignal[]): PromptLanguageDecision {
  for (const signal of [...taskSignals, ...storySignals]) {
    const text = signal.text?.trim();
    if (!text) {
      continue;
    }

    const explicitLanguage = detectExplicitLanguage(text);
    if (explicitLanguage) {
      return {
        language: explicitLanguage,
        reason: `explicit language request in ${signal.label}`,
      };
    }
  }

  for (const signal of taskSignals) {
    const text = signal.text?.trim();
    if (!text) {
      continue;
    }

    const detectedLanguage = chooseLanguage(scoreText(text));
    if (detectedLanguage) {
      return {
        language: detectedLanguage,
        reason: `latest task text in ${signal.label}`,
      };
    }
  }

  const taskLanguage = chooseLanguage(aggregateScores(taskSignals), true);
  if (taskLanguage) {
    return {
      language: taskLanguage,
      reason: `combined task text from ${formatSignalLabels(taskSignals)}`,
    };
  }

  for (const signal of storySignals) {
    const text = signal.text?.trim();
    if (!text) {
      continue;
    }

    const detectedLanguage = chooseLanguage(scoreText(text));
    if (detectedLanguage) {
      return {
        language: detectedLanguage,
        reason: `story materials in ${signal.label}`,
      };
    }
  }

  const storyLanguage = chooseLanguage(aggregateScores(storySignals), true);
  if (storyLanguage) {
    return {
      language: storyLanguage,
      reason: `combined story materials from ${formatSignalLabels(storySignals)}`,
    };
  }

  return {
    language: "English",
    reason: "default fallback",
  };
}

export function buildResponseLanguageInstruction({
  taskSignals,
  storySignals,
}: {
  taskSignals: LanguageSignal[];
  storySignals: LanguageSignal[];
}) {
  const decision = inferPromptLanguage(taskSignals, storySignals);
  const storyLabels = formatSignalLabels(storySignals);

  return `
[RESPONSE LANGUAGE]
Respond in ${decision.language}.
- Follow an explicit request to use Vietnamese or English if the user gives one.
- Otherwise match the language of the latest user-facing task text first.
- If the latest task text is mixed, very short, or unclear, follow the dominant language of the story materials${storyLabels ? ` (${storyLabels})` : ""}.
- Do not translate names, invented terms, or quoted text unless the user asks for translation.
- Do not switch languages mid-response unless the user asks.
Detected preference for this task: ${decision.language} (${decision.reason}).
`.trim();
}

export function resolvePromptLanguage({
  taskSignals,
  storySignals,
}: {
  taskSignals: LanguageSignal[];
  storySignals: LanguageSignal[];
}) {
  return inferPromptLanguage(taskSignals, storySignals).language;
}

export function buildRecentSummaryLanguageSignal(
  summaries: Array<{ chapterTitle: string; summary: string }>,
  label = "recent chapter summaries",
) {
  return {
    label,
    text: summaries
      .flatMap(({ chapterTitle, summary }) => {
        const combined = `${chapterTitle} ${summary}`.trim();
        return combined ? [combined] : [];
      })
      .join("\n"),
  };
}

export function extractLatestUserText(
  messages: Array<{
    role: string;
    content: unknown;
  }>,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .flatMap((part) => {
          if (typeof part === "string") {
            return [part];
          }

          if (!part || typeof part !== "object") {
            return [];
          }

          if ("text" in part && typeof part.text === "string") {
            return [part.text];
          }

          return [];
        })
        .join("\n");
    }
  }

  return "";
}
