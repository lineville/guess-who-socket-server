// Generate a new creative question
// Take into account the board of characters and the eliminated characters
// The goal is to create a question that will be funny and help eliminate many characters
// The question should not be relatively yes or no, not ambiguous.
export const generateQuestion = (
  characters: string[],
  eliminatedCharacters: Set<number>
): string => {
  // TODO
  return "Are you a fun person?";
};

// Generate a "yes" or "no" answer to a question
// Take into account the secret character (image) and the question (string)
// The goal is to provide a reasonable yes or no the way a human would respond
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

// Eliminate a number of characters from the board in response to an answered question
// Take into account the board of characters, the question, the answer, and the eliminated characters
// The goal is to eliminate as many characters as possible, but not eliminate the secret character
// The characters to eliminate should be returned as an set of indexes
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
