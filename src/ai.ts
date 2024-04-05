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
  // Pick 5 new characters to eliminate that are not already eliminated
  const newEliminatedCharacters = new Set<number>();
  while (newEliminatedCharacters.size < 5) {
    const index = Math.floor(Math.random() * characters.length);
    if (!eliminatedCharacters.has(index)) {
      newEliminatedCharacters.add(index);
    }
  }
  return newEliminatedCharacters;
};
