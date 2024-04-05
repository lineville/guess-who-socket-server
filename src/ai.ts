export const generateQuestion = (
  characters: string[],
  eliminatedCharacters: Set<number>
): string => {
  // TODO
  return "Are you a fun person?";
};

export const generateAnswer = (
  secretCharacter: string,
  question: string
): string => {
  // TODO
  if (Math.random() < 0.5) {
    return "Yes";
  } else {
    return "No";
  }
};

export const eliminateCharacters = (
  characters: string[],
  eliminatedCharacters: Set<number>,
  question: string,
  answer: string
): Set<number> => {
  // TODO
  return new Set();
};
