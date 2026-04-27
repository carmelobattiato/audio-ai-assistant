export const WHISPER_LANGUAGE_MAP: Record<string, string> = {
  'Italian':    'italian',
  'English':    'english',
  'French':     'french',
  'German':     'german',
  'Spanish':    'spanish',
  'Portuguese': 'portuguese',
  'Chinese':    'chinese',
  'Japanese':   'japanese',
  'Korean':     'korean',
  'Russian':    'russian',
  'Arabic':     'arabic',
  'Dutch':      'dutch',
  'Polish':     'polish',
  'Turkish':    'turkish',
};

export function toWhisperLanguage(lang: string): string {
  return WHISPER_LANGUAGE_MAP[lang] ?? lang.toLowerCase();
}
