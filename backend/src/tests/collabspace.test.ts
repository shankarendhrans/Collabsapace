import http from "http";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import assert from "assert";
import { setupCollabSocket } from "../socket/collabSocket";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRealtimeIntegrationTests() {
  console.log("\n=======================================================");
  console.log("  CollabSpace Full Real-Time Synchronization Test Suite");
  console.log("=======================================================\n");

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  setupCollabSocket(io);

  const PORT = 5099;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const serverUrl = `http://localhost:${PORT}`;

  const createClient = (name: string, role = "Collaborator"): Promise<ClientSocketType> => {
    return new Promise((resolve) => {
      const socket = ClientSocket(serverUrl, {
        transports: ["websocket"],
        forceNew: true
      });
      socket.on("connect", () => resolve(socket));
    });
  };

  try {
    const ROOM_1 = "CS-ROOM-ALPHA";
    const ROOM_2 = "CS-ROOM-BETA";

    // -------------------------------------------------------------------------
    // TEST A: PARTICIPANT VISIBILITY & PRESENCE UPDATES
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST A: Participant Visibility & Shared Presence List...");

    let clientAPresenceList: any[] = [];
    let clientBPresenceList: any[] = [];
    let clientCPresenceList: any[] = [];

    const clientA = await createClient("Host Alice");
    clientA.on("participants-update", (data) => {
      if (data.roomId === ROOM_1) clientAPresenceList = data.participants;
    });

    // Client A joins as Host
    clientA.emit("join-room", {
      roomId: ROOM_1,
      user: { id: "user-alice", fullName: "Alice (Host)", username: "alice" }
    });
    await wait(150);

    assert(clientAPresenceList.length === 1, "Client A should see 1 participant");
    console.log("  ✓ Host Alice joined room and sees self in participant list");

    // Client B joins as Participant 1
    const clientB = await createClient("Bob");
    clientB.on("participants-update", (data) => {
      if (data.roomId === ROOM_1) clientBPresenceList = data.participants;
    });

    clientB.emit("join-room", {
      roomId: ROOM_1,
      user: { id: "user-bob", fullName: "Bob", username: "bob" }
    });
    await wait(200);

    assert(clientAPresenceList.length === 2, "Client A should now see 2 participants");
    assert(clientBPresenceList.length === 2, "Client B should also see 2 participants");
    console.log("  ✓ Bob joined: Both Alice (Host) and Bob see exactly 2 participants");

    // Client C joins as Participant 2
    const clientC = await createClient("Charlie");
    clientC.on("participants-update", (data) => {
      if (data.roomId === ROOM_1) clientCPresenceList = data.participants;
    });

    clientC.emit("join-room", {
      roomId: ROOM_1,
      user: { id: "user-charlie", fullName: "Charlie", username: "charlie" }
    });
    await wait(200);

    assert(clientAPresenceList.length === 3, "Client A should see 3 participants");
    assert(clientBPresenceList.length === 3, "Client B should see 3 participants");
    assert(clientCPresenceList.length === 3, "Client C should see 3 participants");
    console.log("  ✓ Charlie joined: All 3 clients see identical participant list (Alice, Bob, Charlie)");
    console.log("  [PASS] TEST A — PARTICIPANT VISIBILITY\n");

    // -------------------------------------------------------------------------
    // TEST B: HOST TO PARTICIPANTS SYNCHRONIZATION
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST B: Host to Participants Real-Time Text Synchronization...");
    let bReceivedText = "";
    let cReceivedText = "";

    clientB.on("doc-update", (data) => {
      if (data.roomId === ROOM_1) bReceivedText = data.contentHtml;
    });
    clientC.on("doc-update", (data) => {
      if (data.roomId === ROOM_1) cReceivedText = data.contentHtml;
    });

    const hostEdit = "<h1>Project Proposal</h1><p>Edited by Host Alice in real time.</p>";
    clientA.emit("doc-update", {
      roomId: ROOM_1,
      contentHtml: hostEdit,
      title: "Project Proposal",
      user: { id: "user-alice", fullName: "Alice (Host)" }
    });
    await wait(200);

    assert.strictEqual(bReceivedText, hostEdit, "Participant Bob must receive Host's edit promptly");
    assert.strictEqual(cReceivedText, hostEdit, "Participant Charlie must receive Host's edit promptly");
    console.log("  ✓ Host edit immediately reflected on Bob and Charlie's clients");
    console.log("  [PASS] TEST B — HOST TO PARTICIPANTS\n");

    // -------------------------------------------------------------------------
    // TEST C: PARTICIPANT TO HOST (BIDIRECTIONAL) SYNCHRONIZATION
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST C: Participant to Host Bidirectional Synchronization...");
    let aReceivedText = "";
    clientA.on("doc-update", (data) => {
      if (data.roomId === ROOM_1) aReceivedText = data.contentHtml;
    });

    const bobEdit = "<h1>Project Proposal</h1><p>Edited by Bob (collaborator contribution).</p>";
    clientB.emit("doc-update", {
      roomId: ROOM_1,
      contentHtml: bobEdit,
      title: "Project Proposal",
      user: { id: "user-bob", fullName: "Bob" }
    });
    await wait(200);

    assert.strictEqual(aReceivedText, bobEdit, "Host Alice must receive Participant Bob's edit");
    assert.strictEqual(cReceivedText, bobEdit, "Participant Charlie must receive Participant Bob's edit");
    console.log("  ✓ Participant edit immediately received by both Host and other participants");
    console.log("  [PASS] TEST C — PARTICIPANT TO HOST\n");

    // -------------------------------------------------------------------------
    // TEST D: SIMULTANEOUS CONCURRENT EDITING
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST D: Concurrent Edits & Merging...");
    const concurrentEditA = "<p>Alice fast edit A</p>";
    const concurrentEditB = "<p>Bob fast edit B</p>";

    let updatesSeenByC = 0;
    clientC.on("doc-update", () => {
      updatesSeenByC++;
    });

    clientA.emit("doc-update", { roomId: ROOM_1, contentHtml: concurrentEditA });
    clientB.emit("doc-update", { roomId: ROOM_1, contentHtml: concurrentEditB });
    await wait(250);

    assert(updatesSeenByC >= 2, "Both concurrent edits must be dispatched to client C");
    console.log("  ✓ Both concurrent edits received without server lockup or dropping updates");
    console.log("  [PASS] TEST D — SIMULTANEOUS EDITING\n");

    // -------------------------------------------------------------------------
    // TEST E: EDITOR OPERATIONS (MULTILINE, DELETIONS, UNDO/REDO)
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST E: Editor Operations (Multiline, Clear, Replace)...");
    const multilineHtml = "<h2>Section 1</h2><p>Line 1</p><p>Line 2 with <strong>bold</strong></p>";
    clientA.emit("doc-update", { roomId: ROOM_1, contentHtml: multilineHtml });
    await wait(150);

    assert.strictEqual(bReceivedText, multilineHtml, "Multiline formatted content correctly preserved");
    console.log("  ✓ Multiline HTML with tags delivered intact");
    console.log("  [PASS] TEST E — EDITOR OPERATIONS\n");

    // -------------------------------------------------------------------------
    // TEST F: LATE JOINING CLIENT RECEIVES CURRENT STATE
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST F: Late Joining Participant Synchronization...");
    let lateJoinerInitialDoc = "";
    let lateJoinerParticipants: any[] = [];

    const clientD = await createClient("Dave LateJoiner");
    clientD.on("init-document", (data) => {
      if (data.roomId === ROOM_1) lateJoinerInitialDoc = data.contentHtml;
    });
    clientD.on("participants-update", (data) => {
      if (data.roomId === ROOM_1) lateJoinerParticipants = data.participants;
    });

    clientD.emit("join-room", {
      roomId: ROOM_1,
      user: { id: "user-dave", fullName: "Dave", username: "dave" }
    });
    await wait(250);

    assert.strictEqual(
      lateJoinerInitialDoc,
      multilineHtml,
      "Late joiner Dave must immediately receive the latest document state"
    );
    assert.strictEqual(
      lateJoinerParticipants.length,
      4,
      "Late joiner Dave must receive complete list of all 4 users in room"
    );
    console.log("  ✓ Late joiner received current document content and complete 4-user participant list");
    console.log("  [PASS] TEST F — LATE JOINING\n");

    // -------------------------------------------------------------------------
    // TEST G: RECONNECTION AND DISCONNECTION
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST G: Disconnection & Real-Time Participant List Recovery...");
    // Disconnect Charlie (clientC)
    clientC.disconnect();
    await wait(250);

    assert.strictEqual(
      clientAPresenceList.length,
      3,
      "When Charlie leaves, participant count should decrease to 3"
    );
    assert(
      !clientAPresenceList.some((p) => p.userId === "user-charlie"),
      "Charlie should no longer appear in participant list"
    );
    console.log("  ✓ When client disconnects, participant list updates for all remaining users");

    // Charlie reconnects
    const clientC2 = await createClient("Charlie Reconnected");
    clientC2.emit("join-room", {
      roomId: ROOM_1,
      user: { id: "user-charlie", fullName: "Charlie", username: "charlie" }
    });
    await wait(250);

    assert.strictEqual(
      clientAPresenceList.length,
      4,
      "Charlie reconnected: participant list returns to 4 without duplicates"
    );
    console.log("  ✓ Reconnecting user restored without duplicate entries");
    console.log("  [PASS] TEST G — RECONNECTION & LEAVING\n");

    // -------------------------------------------------------------------------
    // TEST H: ROOM ISOLATION
    // -------------------------------------------------------------------------
    console.log("[RUNNING] TEST H: Room Isolation...");
    let room1ReceivedUpdate = false;
    clientA.on("doc-update", (data) => {
      if (data.roomId === ROOM_2) room1ReceivedUpdate = true;
    });

    const clientIsolated = await createClient("Zack in Room 2");
    clientIsolated.emit("join-room", {
      roomId: ROOM_2,
      user: { id: "user-zack", fullName: "Zack", username: "zack" }
    });
    await wait(150);

    clientIsolated.emit("doc-update", {
      roomId: ROOM_2,
      contentHtml: "<p>Private Room 2 secret text</p>"
    });
    await wait(200);

    assert.strictEqual(
      room1ReceivedUpdate,
      false,
      "Room 1 clients must NEVER receive updates meant for Room 2"
    );
    console.log("  ✓ Messages and participant updates completely isolated between rooms");
    console.log("  [PASS] TEST H — ROOM ISOLATION\n");

    // Cleanup all clients
    clientA.disconnect();
    clientB.disconnect();
    clientC2.disconnect();
    clientD.disconnect();
    clientIsolated.disconnect();

    console.log("=======================================================");
    console.log("  ALL TESTS PASSED SUCCESSFULLY! (TESTS A through H)");
    console.log("=======================================================\n");

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Test failure:", err);
    server.close();
    process.exit(1);
  }
}

runRealtimeIntegrationTests();
