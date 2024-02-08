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

export const createGameState = (clientId: string): State => {
  const characters = shuffleArray(ALL_CHARACTERS).slice(0, NUM_CHARACTERS);

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

export const ALL_CHARACTERS = [
  "Abdul",
  "Ang",
  "Anna",
  "Boris",
  "Carl",
  "Charles",
  "Chimezi",
  "Colin",
  "Destiny",
  "Erin",
  "Fran",
  "Gwen",
  "Imani",
  "Jada",
  "Jing",
  "Kai",
  "Kevin",
  "Kiki",
  "Liza",
  "Len",
  "Lucy",
  "Manu",
  "Marcus",
  "Maria",
  "Martha",
  "Meryl",
  "Miles",
  "Nonna",
  "Paige",
  "Pablo",
  "Raquel",
  "Ron",
  "Samir",
  "Sang",
  "Simu",
  "Stew",
  "Sue",
  "Tina",
  "Tonto",
  "Trae",
  "Waru",
];

const shuffleArray = (array: Array<any>) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
