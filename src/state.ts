export default interface State {
  characters: string[];
  secretCharacters: Map<string, string>;
  winner: string | null;
  turn: string;
  isAsking: boolean;
  dialogues: Message[];
  clientsReady: Set<string>;
  eliminatedCharacters: Map<string, Set<number>>;
}

interface Message {
  content: string;
  clientId: string | null;
}

export const fetchCharacters = async () => {
  const url =
    process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test"
      ? "https://guess-who-virid.vercel.app"
      : "http://localhost:3000";
  const response = await fetch(`${url}/api/characters`);
  const characters = (await response.json()).characters as string[];
  return characters;
};

export const createGameState = async (clientId: string): Promise<State> => {
  const allCharacters = await fetchCharacters();
  const characters = shuffleArray(allCharacters).slice(0, NUM_CHARACTERS);

  let randomIndex = Math.floor(Math.random() * NUM_CHARACTERS);
  const secretCharacters = new Map();
  secretCharacters.set(clientId, characters[randomIndex]);

  const eliminatedCharacters = new Map<string, Set<number>>();
  eliminatedCharacters.set(clientId, new Set());

  return {
    characters: characters,
    secretCharacters: secretCharacters,
    winner: null,
    turn: clientId,
    isAsking: true,
    dialogues: [],
    clientsReady: new Set<string>(),
    eliminatedCharacters: eliminatedCharacters,
  };
};

export const NUM_CHARACTERS = 24;

const shuffleArray = (array: Array<any>) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
