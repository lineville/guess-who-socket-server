import { expect } from "chai";
import { initialize, getOpponentClientId, generateSecretCharacter } from "../src/index";
import State, { NUM_CHARACTERS } from "../src/state";
import { v4 as uuidv4 } from "uuid";

describe("initialize", () => {
  it("should initialize a new game state", () => {
    const gameId = uuidv4();
    const clientId = uuidv4();
    const games = new Map<string, State>();
    const state = initialize(gameId, clientId, games);

    expect(state).to.exist;
    expect(state.characters.length).to.equal(NUM_CHARACTERS);
    expect(state.secretCharacters.size).to.equal(1);
    expect(state.secretCharacters.get(clientId)).to.exist;
    expect(state.turn).to.equal(clientId);
    expect(state.dialogues.length).to.equal(0);
    expect(state.isAsking).to.be.true;
    expect(state.clientsReady.size).to.equal(0);
  });

  it("should add a new client to an existing game", () => {
    const gameId = uuidv4();
    const clientId1 = uuidv4();
    const clientId2 = uuidv4();
    const games = new Map<string, State>();
    const state = initialize(gameId, clientId1, games);
    const state2 = initialize(gameId, clientId2, games);

    expect(state2).to.exist;
    expect(state2.characters.length).to.equal(NUM_CHARACTERS);
    expect(state2.secretCharacters.size).to.equal(2);
    expect(state2.secretCharacters.get(clientId2)).to.exist;
    expect([clientId1, clientId2]).to.include(state2.turn);
    expect(state2.dialogues.length).to.equal(0);
  });

  it("should assign a client an existing character if they rejoin", () => {
    const gameId = uuidv4();
    const clientId = uuidv4();
    const games = new Map<string, State>();
    const state = initialize(gameId, clientId, games);
    const character = state.secretCharacters.get(clientId);
    const state2 = initialize(gameId, clientId, games);

    expect(state2).to.exist;
    expect(state2.secretCharacters.size).to.equal(1);
    expect(state2.secretCharacters.get(clientId)).to.equal(character);
  });
});

describe("generateSecretCharacters", () => {
  it("should generate a secret character for each client", () => {
    const gameId = uuidv4();
    const clientId1 = uuidv4();
    const clientId2 = uuidv4();
    const games = new Map<string, State>();
    const state = initialize(gameId, clientId1, games);
    
    const character1 = state.secretCharacters.get(clientId1);
    const character2 = generateSecretCharacter(clientId2, state);

    expect(character1).to.exist;
    expect(character2).to.exist;
    expect(character1).to.not.equal(character2);
  });
});

describe("getOpponentClientId", () => {
  it("should return the opponent's client ID", () => {
    const gameId = uuidv4();
    const clientId1 = uuidv4();
    const clientId2 = uuidv4();
    const games = new Map<string, State>();
    const state = initialize(gameId, clientId1, games);
    const updatedState = initialize(gameId, clientId2, games);
    const opponent = getOpponentClientId(clientId1, state);

    expect(opponent).to.equal(clientId2);
  });
});
