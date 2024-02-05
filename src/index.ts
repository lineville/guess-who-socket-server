import { Server, Socket } from "socket.io";
import State, { initializeGameState, NUM_CHARACTERS } from "./state.js";
import { useAzureSocketIO } from "@azure/web-pubsub-socket.io";
import dotenv from "dotenv";
import appInsights from "applicationinsights";
import express from "express";
import { v4 as uuidv4 } from "uuid";

// TODO only allow 2 players per room
// TODO Fix logging, to pass data more structured and less repetitive

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
      .setAutoCollectConsole(true)
      .setUseDiskRetryCaching(true)
      .start();
  }

  const app = express();

  // Health Check endpoint for availability monitoring
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  // Setup Socket.IO server
  const io = new Server(
    app.listen(port, () => {
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `🚀 Server ready at http://localhost:${port}`,
        });
      } else {
        console.log(`🚀 Server ready at http://localhost:${port}`);
      }
    })
  );

  const games = new Map<string, State>();

  useAzureSocketIO(io, {
    hub: "Hub",
    connectionString: process.env.WEBPUBSUB_CONNECTION_STRING as string,
  });

  io.on("connection", async (socket: Socket) => {
    const { gameId, clientId } = socket.handshake.query;

    if (process.env.NODE_ENV === "production") {
      appInsights.defaultClient.trackTrace({
        message: `🟢 Client connected: [ID: ${clientId}] to game [${gameId}]`,
      });
    } else {
      console.log(`🟢 Client connected: [ID: ${clientId}] to game [${gameId}]`);
    }

    // Validate gameId
    if (!gameId || typeof gameId !== "string") {
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: "🚨 Invalid gameId provided",
        });
      } else {
        console.log(`🚨 Invalid gameId provided`);
      }
      return;
    }

    // Validate clientId
    if (!clientId || typeof clientId !== "string") {
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: "🚨 Invalid clientId provided",
        });
      } else {
        console.log(`🚨 Invalid clientId provided`);
      }
      return;
    }

    const room = io.of("/").adapter.rooms.get(gameId);
    if (room && room.size >= 2) {
      await socket.emit("error", { message: "This game is full." });
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: "🚨 Game room full",
        });
      } else {
        console.log("🚨 Game room full");
      }
      return;
    }

    // New client connected add them to room
    await socket.join(gameId);

    // Initialize the game state for this socket
    const state = initialize(gameId, clientId, games);

    // Fetch the secret character for this client
    const secretCharacter = state.secretCharacters.get(clientId);

    // Send the initial game state and the secret character to the client
    await socket.emit("init", { ...state, yourCharacter: secretCharacter });
    await socket.to(gameId).emit("turn", state.turn);

    // Handle an incoming question from the client
    socket.on("ask", async (question: string) => {
      state.dialogues.push({ content: question, clientId });
      state.turn = getOpponentClientId(clientId, state);
      state.isAsking = false;
      await socket.broadcast.to(gameId).emit("ask", question);
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `❓ Client asked: ${question}`,
        });
      } else {
        console.log(`❓ Client asked: ${question}`);
      }
    });

    // Handle an incoming answer from the client
    socket.on("answer", async (answer: string) => {
      state.dialogues.push({ content: answer, clientId });
      state.turn = clientId;
      state.isAsking = true;
      await socket.broadcast.to(gameId).emit("answer", answer);
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `📣 Client [${clientId}] answered: ${answer}`,
        });
      } else {
        console.log(`📣 Client [${clientId}] answered: ${answer}`);
      }
    });

    // Broadcast the eliminate action to all clients in the room
    socket.on("eliminate", async () => {
      await socket.broadcast.to(gameId).emit("eliminate");
    });

    // Broadcast the revive action to all clients in the room
    socket.on("revive", async () => {
      await socket.broadcast.to(gameId).emit("revive");
    });

    socket.on("guess", async (guess: string) => {
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `🙊 Client [ID: ${clientId}] guessed ${guess}`,
        });
      } else {
        console.log(`🙊 Client [ID: ${clientId}] guessed ${guess}`);
      }
      const opponentClientId = getOpponentClientId(clientId, state);
      const opponentSecretCharacter =
        state.secretCharacters.get(opponentClientId);

      if (guess === opponentSecretCharacter) {
        if (process.env.NODE_ENV === "production") {
          appInsights.defaultClient.trackTrace({
            message: `🎉 Client [ID: ${clientId}] guessed ${guess} correctly!`,
          });
        } else {
          console.log(
            `🎉 Client [ID: ${clientId}] guessed ${guess} correctly!`
          );
        }
        state.winner = clientId;
        await io.to(gameId).emit("winner", clientId);
      } else {
        if (process.env.NODE_ENV === "production") {
          appInsights.defaultClient.trackTrace({
            message: `😭 Client [ID: ${clientId}] guessed ${guess} incorrectly!`,
          });
        } else {
          console.log(
            `😭 Client [ID: ${clientId}] guessed ${guess} incorrectly!`
          );
        }
        state.turn = opponentClientId!;
        state.isAsking = true;
        await socket.broadcast.to(gameId).emit("bad-guess", guess);
        await socket.emit("answer", "No");
      }
    });

    socket.on("ready", async () => {
      state.clientsReady.add(clientId);

      if (state.clientsReady.size === 1) {
        await socket.broadcast.to(gameId).emit("ready");
        return;
      }

      if (state.clientsReady.size === 2) {
        await io.to(gameId).emit("new-game", uuidv4());
        games.delete(gameId);
        if (process.env.NODE_ENV === "production") {
          appInsights.defaultClient.trackTrace({
            message: `✨ New game created! [GameID: ${gameId}]`,
          });
        } else {
          console.log(`✨ New game created! [GameID: ${gameId}]`);
        }
      }
    });

    // Update the player count when a client joins the room
    io.of("/").adapter.on("join-room", async (gameId: string, _id: string) => {
      const playerCount = (await io.local.in(gameId).fetchSockets()).length;
      await io.to(gameId).emit("playerCount", playerCount);
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `🟢 Client joined: [ID: ${clientId}] to game [${gameId}]`,
        });
      } else {
        console.log(`🟢 Client joined: [ID: ${clientId}] to game [${gameId}]`);
      }
    });

    // Update the player count when a socket leaves the room
    io.of("/").adapter.on("leave-room", async (gameId: string, _id: string) => {
      const playerCount = (await io.local.in(gameId).fetchSockets()).length;
      await io.to(gameId).emit("playerCount", playerCount);
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `🔴 Client left: [ID: ${clientId}] to game [${gameId}]`,
        });
      } else {
        console.log(`🔴 Client left: [ID: ${clientId}] to game [${gameId}]`);
      }
    });

    // Client disconnects
    socket.on("disconnect", async () => {
      if (process.env.NODE_ENV === "production") {
        appInsights.defaultClient.trackTrace({
          message: `🔴 Client disconnected: [ID: ${clientId}] from game [${gameId}]`,
        });
      } else {
        console.log(
          `🔴 Client disconnected: [ID: ${clientId}] from game [${gameId}]`
        );
      }
    });
  });
};

// Initialize the game state for a socket
export const initialize = (
  gameId: string,
  clientId: string,
  games: Map<string, State>
): State => {
  // Create a new game state if this is the first time this game has been joined
  if (!games.has(gameId)) {
    games.set(gameId, initializeGameState(clientId));
    if (process.env.NODE_ENV === "production") {
      appInsights.defaultClient.trackTrace({
        message: `🎮 Game [${gameId}] initialized `,
      });
    } else {
      console.log(`🎮 Game [${gameId}] initialized `);
    }
  }

  const state = games.get(gameId);
  if (state) {
    // If this clientId has no secret character, assign one
    if (!state.secretCharacters.has(clientId)) {
      const character = generateSecretCharacter(clientId, state);
      state.secretCharacters.set(clientId, character);

      // Flip a coin to determine if the second client should go first
      if (Math.random() < 0.5) {
        state.turn = clientId;
      }
    }
  }

  return state as State;
};

// Generate a secret character for a client
export const generateSecretCharacter = (
  clientId: string,
  state: State
): string => {
  let randomIndex = Math.floor(Math.random() * NUM_CHARACTERS);
  const character = state.characters[randomIndex];

  // If this character is already assigned, try again
  if (state.secretCharacters.has(character)) {
    return generateSecretCharacter(clientId, state);
  }

  state.secretCharacters.set(clientId, character);
  return character;
};

// Get the opponent's client ID
export const getOpponentClientId = (clientId: string, state: State): string => {
  for (const [key, value] of state.secretCharacters.entries()) {
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
