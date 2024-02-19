import { test, expect, mock } from "bun:test";
import {
  initialize,
  getOpponentClientId,
  generateSecretCharacter,
} from "../src/index";
import State, { NUM_CHARACTERS } from "../src/state";
import { v4 as uuidv4 } from "uuid";

test("should initialize a new game state", async () => {
  const gameId = uuidv4();
  const clientId = uuidv4();
  const games = new Map<string, State>();
  const state = await initialize(gameId, clientId, games);

  expect(state).toBeDefined();
  expect(state.characters.length).toBe(NUM_CHARACTERS);
  expect(state.secretCharacters.size).toBe(1);
  expect(state.secretCharacters.get(clientId)).toBeDefined();
  expect(state.turn).toBe(clientId);
  expect(state.dialogues.length).toBe(0);
  expect(state.isAsking).toBeTrue();
  expect(state.clientsReady.size).toBe(0);
});

test("should add a new client to an existing game", async () => {
  const gameId = uuidv4();
  const clientId1 = uuidv4();
  const clientId2 = uuidv4();
  const games = new Map<string, State>();
  const state = await initialize(gameId, clientId1, games);
  const state2 = await initialize(gameId, clientId2, games);

  expect(state2).toBeDefined();
  expect(state2.characters.length).toBe(NUM_CHARACTERS);
  expect(state2.secretCharacters.size).toBe(2);
  expect(state2.secretCharacters.get(clientId2)).toBeDefined();
  expect([clientId1, clientId2]).toContain(state2.turn);
  expect(state2.dialogues.length).toBe(0);
});

test("should assign a client an existing character if they rejoin", async () => {
  const gameId = uuidv4();
  const clientId = uuidv4();
  const games = new Map<string, State>();
  const state = await initialize(gameId, clientId, games);
  const character = state.secretCharacters.get(clientId);
  const state2 = await initialize(gameId, clientId, games);

  expect(state2).toBeDefined();
  expect(state2.secretCharacters.size).toBe(1);
  expect(state2.secretCharacters.get(clientId)).toBe(character as string);
});

test("should generate a secret character for each client", async () => {
  const gameId = uuidv4();
  const clientId1 = uuidv4();
  const clientId2 = uuidv4();
  const games = new Map<string, State>();
  const state = await initialize(gameId, clientId1, games);

  const character1 = state.secretCharacters.get(clientId1);
  const character2 = generateSecretCharacter(clientId2, state);

  expect(character1).toBeDefined();
  expect(character2).toBeDefined();
  expect(character1).not.toBe(character2);
});

test("should return the opponent's client ID", async () => {
  const gameId = uuidv4();
  const clientId1 = uuidv4();
  const clientId2 = uuidv4();
  const games = new Map<string, State>();
  const state = await initialize(gameId, clientId1, games);
  const updatedState = await initialize(gameId, clientId2, games);
  const opponent = getOpponentClientId(clientId1, state);

  expect(opponent).toBe(clientId2);
});
