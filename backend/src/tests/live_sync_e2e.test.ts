import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import assert from "assert";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SERVER_URL = "http://localhost:5000";

function createClient(label: string): Promise<ClientSocketType> {
  return new Promise((resolve, reject) => {
    const socket = ClientSocket(SERVER_URL, {
      transports: ["websocket", "polling"],
      forceNew: true,
      timeout: 5000
    });
    socket.on("connect", () => {
      // console.log(`  [connected] ${label} (${socket.id})`);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      reject(new Error(`${label} failed to connect: ${err.message}`));
    });
  });
}

async function runLiveSyncE2ETests() {
  console.log("\n======================================================================");
  console.log("  CollabSpace LIVE SERVER END-TO-END COLLABORATION VERIFICATION TEST");
  console.log("  Target: " + SERVER_URL);
  console.log("======================================================================\n");

  const ROOM_A = "LIVE-ROOM-" + Date.now();
  const ROOM_B = "ISOLATED-ROOM-" + Date.now();

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Room Creation & Multi-Participant Presence
    // -----------------------------------------------------------------------
    console.log("[TEST 1] Host creates room and Party Members join...");
    const host = await createClient("Host Alice");
    const member1 = await createClient("Member Bob");
    const member2 = await createClient("Member Charlie");

    let hostPresence: any[] = [];
    let bobPresence: any[] = [];
    let charliePresence: any[] = [];

    host.on("participants-update", (d) => { if (d.roomId === ROOM_A) hostPresence = d.participants; });
    member1.on("participants-update", (d) => { if (d.roomId === ROOM_A) bobPresence = d.participants; });
    member2.on("participants-update", (d) => { if (d.roomId === ROOM_A) charliePresence = d.participants; });

    // Host joins
    host.emit("join-room", {
      roomId: ROOM_A,
      user: { id: "user-host-alice", fullName: "Alice (Host)", role: "Host" }
    });
    await wait(200);
    assert.strictEqual(hostPresence.length, 1, "Host should see 1 participant");

    // Member Bob joins
    member1.emit("join-room", {
      roomId: ROOM_A,
      user: { id: "user-member-bob", fullName: "Bob", role: "Collaborator" }
    });
    await wait(200);
    assert.strictEqual(hostPresence.length, 2, "Host should see 2 participants");
    assert.strictEqual(bobPresence.length, 2, "Bob should see 2 participants");

    // Member Charlie joins
    member2.emit("join-room", {
      roomId: ROOM_A,
      user: { id: "user-member-charlie", fullName: "Charlie", role: "Collaborator" }
    });
    await wait(200);
    assert.strictEqual(hostPresence.length, 3, "Host should see 3 participants");
    assert.strictEqual(bobPresence.length, 3, "Bob should see 3 participants");
    assert.strictEqual(charliePresence.length, 3, "Charlie should see 3 participants");
    console.log("  ✓ All 3 participants connected and presence synchronized correctly.\n");

    // -----------------------------------------------------------------------
    // TEST 2: Bidirectional Text Synchronization (Host -> Members & Member -> Host)
    // -----------------------------------------------------------------------
    console.log("[TEST 2] Bidirectional Real-Time Text Editing...");
    let bobReceivedText = "";
    let charlieReceivedText = "";
    let hostReceivedText = "";

    member1.on("doc-update", (d) => { if (d.roomId === ROOM_A) bobReceivedText = d.contentHtml; });
    member2.on("doc-update", (d) => { if (d.roomId === ROOM_A) charlieReceivedText = d.contentHtml; });
    host.on("doc-update", (d) => { if (d.roomId === ROOM_A) hostReceivedText = d.contentHtml; });

    // Host types
    const hostText = "<h2>CollabSpace Live Doc</h2><p>Initial draft written by Host Alice.</p>";
    host.emit("doc-update", {
      roomId: ROOM_A,
      contentHtml: hostText,
      title: "Live Document",
      user: { id: "user-host-alice", fullName: "Alice (Host)" }
    });
    await wait(200);

    assert.strictEqual(bobReceivedText, hostText, "Bob must receive Host's edit");
    assert.strictEqual(charlieReceivedText, hostText, "Charlie must receive Host's edit");
    console.log("  ✓ Host-to-participants text propagation verified.");

    // Member Bob types
    const bobText = "<h2>CollabSpace Live Doc</h2><p>Initial draft written by Host Alice.</p><p>Appended paragraph from Bob.</p>";
    member1.emit("doc-update", {
      roomId: ROOM_A,
      contentHtml: bobText,
      title: "Live Document",
      user: { id: "user-member-bob", fullName: "Bob" }
    });
    await wait(200);

    assert.strictEqual(hostReceivedText, bobText, "Host must receive Bob's edit");
    assert.strictEqual(charlieReceivedText, bobText, "Charlie must receive Bob's edit");
    console.log("  ✓ Participant-to-host and participant-to-participant text propagation verified.\n");

    // -----------------------------------------------------------------------
    // TEST 3: Simultaneous Editing / Rapid Concurrent Typing
    // -----------------------------------------------------------------------
    console.log("[TEST 3] Simultaneous Concurrent Typing...");
    let updatesReceivedByCharlie = 0;
    member2.on("doc-update", (d) => {
      if (d.roomId === ROOM_A) updatesReceivedByCharlie++;
    });

    const editAlice = bobText + "<p>Fast Edit Alice</p>";
    const editBob = bobText + "<p>Fast Edit Bob</p>";

    // Emit concurrently
    await Promise.all([
      new Promise<void>((r) => { host.emit("doc-update", { roomId: ROOM_A, contentHtml: editAlice }); r(); }),
      new Promise<void>((r) => { member1.emit("doc-update", { roomId: ROOM_A, contentHtml: editBob }); r(); })
    ]);
    await wait(300);

    assert(updatesReceivedByCharlie >= 2, "Charlie should receive both concurrent edits without dropped messages");
    console.log("  ✓ Concurrent edits processed without server lockup or dropped packets.\n");

    // -----------------------------------------------------------------------
    // TEST 4: Drawing Synchronization (Live Stroke + Snapshot + Undo + Clear)
    // -----------------------------------------------------------------------
    console.log("[TEST 4] Drawing Synchronization (Live Stroke + Snapshot + Undo + Clear)...");
    let bobLiveStroke: any = null;
    let charlieLiveStroke: any = null;
    let bobSketchSnapshot: any = null;
    let bobReceivedUndo = false;
    let bobReceivedClear = false;

    member1.on("sketch-live-stroke", (d) => { if (d.roomId === ROOM_A) bobLiveStroke = d; });
    member2.on("sketch-live-stroke", (d) => { if (d.roomId === ROOM_A) charlieLiveStroke = d; });
    member1.on("sketch-update", (d) => { if (d.roomId === ROOM_A) bobSketchSnapshot = d; });
    member1.on("sketch-undo", (d) => { if (d.roomId === ROOM_A) bobReceivedUndo = true; });
    member1.on("sketch-clear", (d) => { if (d.roomId === ROOM_A) bobReceivedClear = true; });

    // Step 4a: Live stroke from Host
    const strokeData = {
      roomId: ROOM_A,
      targetCanvasId: "whiteboardCanvas",
      fromX: 50,
      fromY: 75,
      toX: 85,
      toY: 110,
      tool: "brush",
      color: "#3b82f6",
      size: 6
    };
    host.emit("sketch-live-stroke", strokeData);
    await wait(200);

    assert(bobLiveStroke !== null, "Bob must receive real-time live stroke");
    assert.strictEqual(bobLiveStroke.color, "#3b82f6");
    assert.strictEqual(bobLiveStroke.tool, "brush");
    assert.strictEqual(charlieLiveStroke.toX, 85);
    console.log("  ✓ Real-time continuous live stroke coordinates and style received by all participants.");

    // Step 4b: Final stroke snapshot from Member Bob
    const sampleCanvasPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
    member1.emit("sketch-update", {
      roomId: ROOM_A,
      targetCanvasId: "whiteboardCanvas",
      dataUrl: sampleCanvasPng,
      user: { fullName: "Bob" }
    });
    await wait(200);

    let hostSketchSnapshot: any = null;
    host.on("sketch-update", (d) => { if (d.roomId === ROOM_A) hostSketchSnapshot = d; });
    
    // Send another snapshot to verify host receives it
    member1.emit("sketch-update", {
      roomId: ROOM_A,
      targetCanvasId: "whiteboardCanvas",
      dataUrl: sampleCanvasPng,
      user: { fullName: "Bob" }
    });
    await wait(200);
    assert(hostSketchSnapshot !== null, "Host must receive sketch update from participant Bob");
    console.log("  ✓ Participant-to-host canvas snapshot synchronization verified.");

    // Step 4c: Undo and Clear operations
    host.emit("sketch-undo", { roomId: ROOM_A, targetCanvasId: "whiteboardCanvas" });
    await wait(150);
    assert.strictEqual(bobReceivedUndo, true, "Bob must receive sketch-undo");

    host.emit("sketch-clear", { roomId: ROOM_A });
    await wait(150);
    assert.strictEqual(bobReceivedClear, true, "Bob must receive sketch-clear");
    console.log("  ✓ Canvas undo and clear operations synchronized across all participants.\n");

    // -----------------------------------------------------------------------
    // TEST 5: Late-Joining Participant State Recovery (Text + Drawing)
    // -----------------------------------------------------------------------
    console.log("[TEST 5] Late-Joining Participant State Recovery...");
    // Update authoritative state prior to late joiner
    const latestDoc = "<h3>Late Join Test</h3><p>Authoritative document state before late joiner arrives.</p>";
    host.emit("doc-update", { roomId: ROOM_A, contentHtml: latestDoc });
    host.emit("sketch-update", {
      roomId: ROOM_A,
      targetCanvasId: "whiteboardCanvas",
      dataUrl: sampleCanvasPng
    });
    await wait(200);

    let lateJoinerDoc = "";
    let lateJoinerSketches: any = null;
    let lateJoinerParticipants: any[] = [];

    const lateJoiner = await createClient("Late Member Dave");
    lateJoiner.on("init-document", (d) => {
      if (d.roomId === ROOM_A) {
        lateJoinerDoc = d.contentHtml;
        lateJoinerSketches = d.sketches;
      }
    });
    lateJoiner.on("participants-update", (d) => {
      if (d.roomId === ROOM_A) lateJoinerParticipants = d.participants;
    });

    lateJoiner.emit("join-room", {
      roomId: ROOM_A,
      user: { id: "user-late-dave", fullName: "Dave (Late)", role: "Collaborator" }
    });
    await wait(300);

    assert.strictEqual(lateJoinerDoc, latestDoc, "Late joiner must receive authoritative document state");
    assert(lateJoinerSketches !== null, "Late joiner must receive canvas sketches dictionary");
    assert.strictEqual(lateJoinerSketches["whiteboardCanvas"], sampleCanvasPng, "Late joiner must receive persisted canvas state");
    assert.strictEqual(lateJoinerParticipants.length, 4, "Late joiner must see all 4 participants in the room");
    console.log("  ✓ Late joiner successfully synchronized with authoritative text, drawing, and presence.\n");

    // -----------------------------------------------------------------------
    // TEST 6: Room Isolation (Edits in Room A never leak to Room B)
    // -----------------------------------------------------------------------
    console.log("[TEST 6] Multi-Room Isolation...");
    const isolatedUser = await createClient("Isolated User Frank");
    let roomBLeakDetected = false;

    isolatedUser.on("doc-update", (d) => {
      if (d.roomId === ROOM_A) roomBLeakDetected = true;
    });
    isolatedUser.on("sketch-update", (d) => {
      if (d.roomId === ROOM_A) roomBLeakDetected = true;
    });

    isolatedUser.emit("join-room", {
      roomId: ROOM_B,
      user: { id: "user-frank", fullName: "Frank", role: "Host" }
    });
    await wait(200);

    // Blast edits into ROOM_A
    host.emit("doc-update", { roomId: ROOM_A, contentHtml: "<p>Room A Private Chatter</p>" });
    host.emit("sketch-live-stroke", { ...strokeData, roomId: ROOM_A });
    await wait(200);

    assert.strictEqual(roomBLeakDetected, false, "Room B must NEVER receive events or strokes from Room A");
    console.log("  ✓ Strict multi-room isolation confirmed.\n");

    // -----------------------------------------------------------------------
    // TEST 7: Reconnection & Clean Disconnection
    // -----------------------------------------------------------------------
    console.log("[TEST 7] Participant Disconnection & Reconnection...");
    // Member Bob disconnects
    member1.disconnect();
    await wait(250);

    assert.strictEqual(hostPresence.length, 3, "Participant count should drop from 4 to 3 when Bob leaves");
    assert(!hostPresence.some((p) => p.userId === "user-member-bob"), "Bob should not be in presence list");
    console.log("  ✓ Disconnection cleanly removed participant without stale artifacts.");

    // Bob reconnects with same user ID
    const bobReconnected = await createClient("Bob Reconnected");
    bobReconnected.emit("join-room", {
      roomId: ROOM_A,
      user: { id: "user-member-bob", fullName: "Bob", role: "Collaborator" }
    });
    await wait(250);

    assert.strictEqual(hostPresence.length, 4, "Participant count returns to 4 on reconnection");
    console.log("  ✓ Reconnection seamlessly re-established without duplicating presence entries.\n");

    // Cleanup
    host.disconnect();
    member2.disconnect();
    lateJoiner.disconnect();
    isolatedUser.disconnect();
    bobReconnected.disconnect();

    console.log("======================================================================");
    console.log("  ALL LIVE SERVER COLLABORATION TESTS PASSED (100% SUCCESS)");
    console.log("======================================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

runLiveSyncE2ETests();
