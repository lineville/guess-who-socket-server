import { Server, Socket } from "socket.io";
import State, { createGameState, NUM_CHARACTERS } from "./state.js";
import { useAzureSocketIO } from "@azure/web-pubsub-socket.io";
import dotenv from "dotenv";
import appInsights from "applicationinsights";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { Mutex } from "async-mutex";
import { generateQuestion, generateAnswer, eliminateCharacters } from "./ai.js";
import cors from "cors";

dotenv.config({ path: ".env.local" });
const PORT = parseInt(process.env.PORT || "3000", 10);

export const main = async (port: number) => {
  if (process.env.NODE_ENV === "production") {
    appInsights
      .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, true)
      .setUseDiskRetryCaching(true)
      .start();
  }

  const app = express();

  const corsOptions = {
    origin: "https://guess-who-ai.vercel.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Health Check endpoint for availability monitoring
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  // Setup Socket.IO server
  const io = new Server(
    app.listen(port, () =>
      console.log(
        `🚀 Server running on port ${port}\n✨ http://localhost:${port} ✨`
      )
    ),
    {
      cors: corsOptions,
    }
  );

  const games = new Map<string, State>();
  const mutex = new Mutex();

  useAzureSocketIO(io, {
    hub: "Hub",
    connectionString: process.env.WEBPUBSUB_CONNECTION_STRING as string,
  });

  io.of("/").adapter.on(
    "leave-room",
    async (roomId: string, socketId: string) => {
      const playerCount = (await io.local.in(roomId).fetchSockets()).length;
      io.to(roomId).emit("playerCount", playerCount);
      console.log(
        `🔴 ← Leave Room Event! [SocketID: ${socketId}] [GameID: ${roomId}] [PlayerCount: ${playerCount}]`
      );
    }
  );

  io.of("/").adapter.on(
    "join-room",
    async (roomId: string, socketId: string) => {
      const playerCount = (await io.local.in(roomId).fetchSockets()).length;
      io.to(roomId).emit("playerCount", playerCount);
      console.log(
        `🟢 → Join Room Event! [SocketID: ${socketId}] [GameID: ${roomId}] [PlayerCount: ${playerCount}]`
      );
    }
  );

  io.on("connection", async (socket: Socket) => {
    const { gameId, clientId, gameType, gameMode } = socket.handshake.query;

    console.log(
      `🔌 Client connected! [ClientID: ${clientId}] [GameID: ${gameId}] [GameType: ${gameType}] [GameMode: ${gameMode}]`
    );

    // Validate gameId
    if (!gameId || typeof gameId !== "string") {
      console.log(`🚨 Invalid gameId provided [GameID: ${gameId}]`);
      return;
    }

    // Validate clientId
    if (!clientId || typeof clientId !== "string") {
      console.log(`🚨 Invalid clientId provided [ID: ${clientId}]`);
      return;
    }

    // Validate gameType
    if (!gameType || typeof gameType !== "string") {
      console.log(`🚨 Invalid gameType provided [Type: ${gameType}]`);
      return;
    }

    // Validate gameMode
    if (!gameMode || typeof gameMode !== "string") {
      console.log(`🚨 Invalid gameMode provided [Mode: ${gameMode}]`);
      return;
    }

    const room = io.of("/").adapter.rooms.get(gameId);
    if (room && room.size >= 2) {
      await socket.emit("error", "This game is full.");
      console.log(
        `🚨 Game room full! [GameID: ${gameId}] [ClientID: ${clientId}]`
      );
      return;
    }

    // New client connected add them to room
    await socket.join(gameId);
    console.log(`✅ Client joined room! [ClientID: ${clientId}] [GameID: ${gameId}]`);

    // Initialize the game state for this socket
    const state = await mutex.runExclusive(async () => {
      return await initialize(gameId, clientId, games, gameType, gameMode);
    });

    // Fetch the secret character for this client
    const secretCharacter = state.secretCharacters.get(clientId);

    // Send the initial game state and the secret character to the client
    await socket.emit("init", {
      ...state,
      yourCharacter: secretCharacter,
      eliminatedCharacters: [
        ...(state.eliminatedCharacters.get(clientId) || new Set()).keys(),
      ],
    });

    await socket.to(gameId).emit("turn", state.turn);

    // Handle an incoming question from the client
    socket.on("ask", async (question: string) => {
      state.dialogues.push({ content: question, clientId });
      state.turn = getOpponentClientId(clientId, state);
      state.isAsking = false;
      await socket.broadcast.to(gameId).emit("ask", question);
      console.log(
        `❓ Client asked: ${question} [ClientID: ${clientId}] [GameID: ${gameId}]`
      );

      if (gameMode === "single-player") {
        const answer = generateAnswer(
          state.secretCharacters.get("AI")!,
          question
        );
        state.dialogues.push({ content: answer, clientId: "AI" });
        await socket.emit("answer", answer);
        console.log(
          `📣 AI answered: ${answer} [ClientID: ${clientId}] [GameID: ${gameId}]`
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // TODO handle AI guessing character -- need some proxy for how confident we are it's each of the remaining characters
        // if one of the characters probability exceeds a certain threshold, guess it

        const aiQuestion = generateQuestion(
          state.characters,
          state.eliminatedCharacters.get("AI")!
        );
        state.dialogues.push({ content: aiQuestion, clientId: "AI" });
        state.turn = clientId;
        state.isAsking = false;
        await socket.emit("ask", aiQuestion);
        console.log(
          `❓ AI asked: ${aiQuestion} [ClientID: ${clientId}] [GameID: ${gameId}]`
        );
      }
    });

    // Handle an incoming answer from the client
    socket.on("answer", async (answer: string) => {
      state.dialogues.push({ content: answer, clientId });
      state.turn = clientId;
      state.isAsking = true;
      await socket.broadcast.to(gameId).emit("answer", answer);
      console.log(
        `📣 Client answered: ${answer} [ClientID: ${clientId}] [GameID: ${gameId}]`
      );

      if (gameMode === "single-player") {
        const eliminations = eliminateCharacters(
          state.characters,
          state.eliminatedCharacters.get("AI")!,
          state.dialogues.at(-1)!.content,
          answer
        );
        state.eliminatedCharacters.set(
          "AI",
          new Set([
            ...(state.eliminatedCharacters.get("AI") || []),
            ...eliminations,
          ])
        );
        socket.emit(
          "eliminated-count",
          state.eliminatedCharacters.get("AI")!.size
        );
      }
    });

    // Broadcast the count of eliminated to opponent, send the whole set to the client
    socket.on("eliminate", async (index: number) => {
      state.eliminatedCharacters.set(
        clientId,
        (state.eliminatedCharacters.get(clientId) || new Set()).add(index)
      );
      await socket.broadcast
        .to(gameId)
        .emit(
          "eliminated-count",
          state.eliminatedCharacters.get(clientId)?.size
        );
      await socket.emit("eliminate", [
        ...(state.eliminatedCharacters.get(clientId) || new Set()).keys(),
      ]);
      console.log(
        `🔫 Client eliminated: ${index} [ClientID: ${clientId}] [GameID: ${gameId}]`
      );
    });

    // Broadcast the count of alive to opponent, send the whole set to the client
    socket.on("revive", async (index: number) => {
      const newChars =
        state.eliminatedCharacters.get(clientId) || new Set<number>();
      newChars?.delete(index);
      state.eliminatedCharacters.set(clientId, newChars);
      await socket.broadcast
        .to(gameId)
        .emit(
          "eliminated-count",
          state.eliminatedCharacters.get(clientId)?.size
        );
      await socket.emit("revive", [
        ...(state.eliminatedCharacters.get(clientId) || new Set()).keys(),
      ]);
      console.log(
        `🧟 Client revived ${index} [ClientID: ${clientId}] [GameID: ${gameId}]`
      );
    });

    socket.on("guess", async (guess: string) => {
      console.log(
        `🙊 Client guessed ${guess} [ClientID: ${clientId}] [GameID: ${gameId}]`
      );
      const opponentClientId = getOpponentClientId(clientId, state);
      const opponentSecretCharacter =
        state.secretCharacters.get(opponentClientId);

      if (guess === opponentSecretCharacter) {
        console.log(
          `🎉 Client guessed ${guess} correctly! [ClientID: ${clientId}] [GameID: ${gameId}]`
        );
        state.winner = clientId;
        await io.to(gameId).emit("winner", clientId);
      } else {
        console.log(
          `😭 Client guessed ${guess} incorrectly! [ClientID: ${clientId}] [GameID: ${gameId}]`
        );
        state.turn = opponentClientId!;
        state.isAsking = true;
        await socket.broadcast.to(gameId).emit("bad-guess", guess);
        await socket.emit("answer", "No");

        // if (state.eliminatedCharacters.get("AI")!.size >= NUM_CHARACTERS - 5) {
        //   const remainingCharacters = state.characters.filter(
        //     (c, i) => !state.eliminatedCharacters.get("AI")!.has(i)
        //   );
        //   const randomCharacter =
        //     remainingCharacters[
        //       Math.floor(Math.random() * remainingCharacters.length)
        //     ];
        //   state.dialogues.push({
        //     content: `Is your character ${randomCharacter}?`,
        //     clientId: "AI",
        //   });
        //   state.turn = clientId;
        //   state.isAsking = true;
        //   await socket.emit("guess", randomCharacter);
        // } else {
        const aiQuestion = generateQuestion(
          state.characters,
          state.eliminatedCharacters.get("AI")!
        );
        state.dialogues.push({ content: aiQuestion, clientId: "AI" });
        state.turn = clientId;
        state.isAsking = false;
        await socket.emit("ask", aiQuestion);
        console.log(
          `❓ AI asked: ${aiQuestion} [ClientID: ${clientId}] [GameID: ${gameId}]`
        );
        // }
      }
    });

    socket.on("ready", async () => {
      state.clientsReady.add(clientId);
      if (gameMode === "single-player") {
        state.clientsReady.add("AI");
      }

      if (state.clientsReady.size === 1) {
        await socket.broadcast.to(gameId).emit("ready");
        return;
      }

      if (state.clientsReady.size === 2) {
        await io.to(gameId).emit("new-game", uuidv4());
        games.delete(gameId);
        console.log(`✨ New game created! [GameID: ${gameId}]`);
      }
    });

    // Client disconnects
    socket.on("disconnect", async () => {
      console.log(
        `👋 Client disconnected! [ClientID: ${clientId}] [GameID: ${gameId}]`
      );
    });
  });
};

// Initialize the game state for a socket
export const initialize = async (
  gameId: string,
  clientId: string,
  games: Map<string, State>,
  gameType: string = "pixar",
  gameMode: string = "multi-player"
): Promise<State> => {
  // Create a new game state if this is the first time this game has been joined
  if (!games.has(gameId)) {
    const allCharacters = await fetchCharacters(gameType);
    games.set(gameId, await createGameState(clientId, allCharacters));
    console.log(
      `🎮 Game initialized [ClientID: ${clientId}] [GameID: ${gameId}]`
    );
  }

  const state = games.get(gameId);
  if (state) {
    // If this clientId has no secret character, assign one
    if (!state.secretCharacters.has(clientId)) {
      const character = generateSecretCharacter(clientId, state);
      state.secretCharacters.set(clientId, character);
      state.eliminatedCharacters.set(clientId, new Set<number>());

      // Flip a coin to determine if the second client should go first
      if (Math.random() < 0.5) {
        state.turn = clientId;
      }
    }

    if (!state.eliminatedCharacters.has(clientId)) {
      state.eliminatedCharacters.set(clientId, new Set());
    }

    // Check if the game mode is single-player and initialize AI player
    if (gameMode === "single-player") {
      const aiSecretCharacter = generateSecretCharacter("AI", state);
      state.secretCharacters.set("AI", aiSecretCharacter);
      state.eliminatedCharacters.set("AI", new Set<number>());

      console.log(
        `🤖 AI Player initialized for single-player mode [GameID: ${gameId}]`
      );
    }
  }

  return state as State;
};

const fetchCharacters = async (gameType: string = "pixar") => {
  const url =
    process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test"
      ? "https://guess-who-ai.vercel.app"
      : "http://localhost:3000";
  const response = await fetch(`${url}/api/characters?gameType=${gameType}`);
  const characters = (await response.json()).characters as string[];
  return characters;
};

// Generate a secret character for a client
export const generateSecretCharacter = (
  clientId: string,
  state: State
): string => {
  let randomIndex = Math.floor(Math.random() * NUM_CHARACTERS);
  const character = state.characters[randomIndex];

  // If this character is already assigned, try again
  if (new Set(state.secretCharacters.values()).has(character)) {
    return generateSecretCharacter(clientId, state);
  }

  state.secretCharacters.set(clientId, character);
  return character;
};

// Get the opponent's client ID
export const getOpponentClientId = (clientId: string, state: State): string => {
  for (const [key, _value] of state.secretCharacters.entries()) {
    if (key !== clientId) {
      return key;
    }
  }
  return "";
};

// Run the server if not in test mode
if (process.env.NODE_ENV !== "test") {
  await main(PORT);
}
