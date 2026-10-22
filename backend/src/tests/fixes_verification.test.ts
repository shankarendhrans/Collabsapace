import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import assert from "assert";
import fs from "fs";
import path from "path";

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
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      reject(new Error(`${label} failed to connect: ${err.message}`));
    });
  });
}

async function runFixesVerification() {
  console.log("\n==========================================================================");
  console.log("  COLLABSPACE MASTER TEST SUITE — VERIFYING FIXES FOR ISSUES 1, 2, AND 3");
  console.log("  Target Server: " + SERVER_URL);
  console.log("==========================================================================\n");

  const READONLY_ROOM = "RO-ROOM-" + Date.now();
  const OPEN_ROOM = "OPEN-ROOM-" + Date.now();
  const ISOLATED_ROOM = "ISO-ROOM-" + Date.now();

  const results: Record<string, boolean> = {};

  try {
    // =========================================================================
    // SECTION 1: ISSUE 1 — READ-ONLY VIEWER MODE ENFORCEMENT
    // =========================================================================
    console.log("--- SECTION 1: Read-Only Viewer Mode Enforcement ---");

    const roHost = await createClient("RO Host");
    const roViewer = await createClient("RO Viewer");

    let roViewerInitData: any = null;
    let roViewerPermissionDeniedEvents: any[] = [];
    let roHostReceivedEdits: any[] = [];
    let roViewerReceivedEdits: any[] = [];

    roViewer.on("init-document", (data) => {
      roViewerInitData = data;
    });
    roViewer.on("permission-denied", (data) => {
      roViewerPermissionDeniedEvents.push(data);
    });
    roHost.on("doc-update", (data) => {
      roHostReceivedEdits.push(data);
    });
    roViewer.on("doc-update", (data) => {
      roViewerReceivedEdits.push(data);
    });

    // 1. Host creates & joins Read-Only Room
    roHost.emit("join-room", {
      roomId: READONLY_ROOM,
      access: "readonly",
      defaultRole: "viewer",
      roomTitle: "Architecture Lecture (Read-Only)",
      contentHtml: "<h1>Distributed Systems Notes</h1><p>Authored by Host.</p>",
      user: { id: "host-user-1", fullName: "Prof. Alan", role: "Host" }
    });
    await wait(250);

    // 2. Viewer joins the room
    roViewer.emit("join-room", {
      roomId: READONLY_ROOM,
      user: { id: "viewer-user-2", fullName: "Student Bob", role: "Collaborator" } // Attempts to join as collaborator
    });
    await wait(350);

    assert(roViewerInitData !== null, "Viewer must receive init-document on join");
    assert.strictEqual(roViewerInitData.role, "Viewer", "Server must assign Viewer role to participant in readonly room");
    assert.strictEqual(roViewerInitData.isReadOnly, true, "Server must flag isReadOnly as true for participant");
    assert.strictEqual(roViewerInitData.isHost, false, "Participant must not be marked as Host");
    console.log("  ✓ Server authoritative role assignment: participant correctly assigned Viewer (isReadOnly=true)");
    results["ReadOnly_Role_Assignment"] = true;

    // 3. Host makes legitimate edit -> Viewer receives update
    roHost.emit("doc-update", {
      roomId: READONLY_ROOM,
      contentHtml: "<h1>Distributed Systems Notes</h1><p>Authored by Host. Section 1 Updated.</p>",
      crdtVersion: 2,
      user: { id: "host-user-1", fullName: "Prof. Alan", role: "Host" }
    });
    await wait(250);
    assert(roViewerReceivedEdits.length > 0, "Viewer must receive legitimate host updates");
    assert.strictEqual(roViewerReceivedEdits[roViewerReceivedEdits.length - 1].contentHtml, "<h1>Distributed Systems Notes</h1><p>Authored by Host. Section 1 Updated.</p>");
    console.log("  ✓ Host can edit and viewer receives real-time document updates");
    results["Host_Editing_Works"] = true;

    // 4. Viewer attempts unauthorized doc-update edit -> Server rejects with permission-denied
    roHostReceivedEdits = [];
    roViewer.emit("doc-update", {
      roomId: READONLY_ROOM,
      contentHtml: "<p>UNAUTHORIZED TAMPERING BY VIEWER</p>",
      crdtVersion: 3,
      user: { id: "viewer-user-2", fullName: "Student Bob", role: "Viewer" }
    });
    await wait(250);
    assert.strictEqual(roHostReceivedEdits.length, 0, "Host must NEVER receive unauthorized viewer edit");
    assert(roViewerPermissionDeniedEvents.some((e) => e.action === "edit"), "Server must emit permission-denied for unauthorized text edit");
    console.log("  ✓ Backend rejects forged text edits from read-only viewer with permission-denied");
    results["ReadOnly_Text_Edit_Rejected"] = true;

    // 5. Viewer attempts unauthorized sketch stroke
    roViewer.emit("sketch-live-stroke", {
      roomId: READONLY_ROOM,
      targetCanvasId: "whiteboardCanvas",
      fromX: 10,
      fromY: 10,
      toX: 50,
      toY: 50,
      tool: "pen",
      color: "#ff0000",
      size: 4
    });
    await wait(200);
    assert(roViewerPermissionDeniedEvents.some((e) => e.action === "sketch"), "Server must emit permission-denied for unauthorized drawing");
    console.log("  ✓ Backend rejects unauthorized drawing strokes from read-only viewer");
    results["ReadOnly_Sketch_Rejected"] = true;

    // 6. Viewer attempts unauthorized file upload via HTTP endpoint -> Expect HTTP 403
    const formData = new FormData();
    const dummyBlob = new Blob(["malicious payload"], { type: "text/plain" });
    formData.append("file", dummyBlob, "unauthorized.txt");

    const uploadRes = await fetch(`${SERVER_URL}/api/documents/upload/${READONLY_ROOM}`, {
      method: "POST",
      headers: {
        "x-user-id": "viewer-user-2"
      },
      body: formData
    });
    assert.strictEqual(uploadRes.status, 403, "Server must return 403 Forbidden for unauthorized upload in read-only room");
    console.log("  ✓ Backend rejects unauthorized file upload in read-only room with HTTP 403 Forbidden\n");
    results["ReadOnly_Upload_Rejected"] = true;

    // =========================================================================
    // SECTION 2: ISSUE 3 — UPLOADED IMAGES & DOCUMENTS SYNCHRONIZATION
    // =========================================================================
    console.log("--- SECTION 2: Uploaded Files & Multi-Participant Sync ---");

    const openHost = await createClient("Open Host");
    const openMember1 = await createClient("Open Member 1");
    const openMember2 = await createClient("Open Member 2");

    openHost.emit("join-room", {
      roomId: OPEN_ROOM,
      access: "edit",
      user: { id: "host-alice", fullName: "Alice (Host)", role: "Host" }
    });
    openMember1.emit("join-room", {
      roomId: OPEN_ROOM,
      access: "edit",
      user: { id: "member-bob", fullName: "Bob (Collaborator)", role: "Collaborator" }
    });
    openMember2.emit("join-room", {
      roomId: OPEN_ROOM,
      access: "edit",
      user: { id: "member-charlie", fullName: "Charlie (Collaborator)", role: "Collaborator" }
    });
    await wait(300);

    let bobProjectedFiles: any[] = [];
    let charlieProjectedFiles: any[] = [];
    let hostProjectedFiles: any[] = [];

    openMember1.on("project-file", (d) => bobProjectedFiles.push(d.fileRecord));
    openMember2.on("project-file", (d) => charlieProjectedFiles.push(d.fileRecord));
    openHost.on("project-file", (d) => hostProjectedFiles.push(d.fileRecord));

    // A. Host uploads an Image file
    console.log("[Upload A] Host uploads an Image...");
    const imgData = "fake-png-binary-content-collabspace-test";
    const imgBlob = new Blob([imgData], { type: "image/png" });
    const imgForm = new FormData();
    imgForm.append("file", imgBlob, "system_architecture_diagram.png");

    const hostImgRes = await fetch(`${SERVER_URL}/api/documents/upload/${OPEN_ROOM}`, {
      method: "POST",
      headers: { "x-user-id": "host-alice" },
      body: imgForm
    });
    assert.strictEqual(hostImgRes.status, 201, "Host image upload should return 201 Created");
    const hostImgJson = await hostImgRes.json();
    assert(hostImgJson.success, "Host upload response should indicate success");
    assert(hostImgJson.fileRecord.url, "Host fileRecord must have a valid download URL");
    console.log(`  ✓ Image stored successfully on server. File ID: ${hostImgJson.fileRecord.fileId}, URL: ${hostImgJson.fileRecord.url}`);

    await wait(250);
    assert.strictEqual(bobProjectedFiles.length, 1, "Bob must receive the host's uploaded image via project-file");
    assert.strictEqual(charlieProjectedFiles.length, 1, "Charlie must receive the host's uploaded image via project-file");
    assert.strictEqual(bobProjectedFiles[0].name, "system_architecture_diagram.png");
    console.log("  ✓ Both participants received the image in real time without refreshing");
    results["Owner_Image_Upload_Shared"] = true;

    // Verify file is genuinely downloadable from the server endpoint
    const downloadImgRes = await fetch(`${SERVER_URL}${hostImgJson.fileRecord.url}`);
    assert.strictEqual(downloadImgRes.status, 200, "Server must serve stored file from /api/documents/files/:fileId");
    console.log("  ✓ Server successfully serves uploaded file with HTTP 200");
    results["File_Retrieval_Works"] = true;

    // B. Participant uploads a document (.md / .docx / .txt)
    console.log("[Upload B] Participant Bob uploads a document (.md)...");
    const docData = "# Project Specifications\n\n- Real-time text sync\n- Multi-user drawing\n- Split view projector";
    const docBlob = new Blob([docData], { type: "text/markdown" });
    const docForm = new FormData();
    docForm.append("file", docBlob, "project_specifications.md");

    const bobDocRes = await fetch(`${SERVER_URL}/api/documents/upload/${OPEN_ROOM}`, {
      method: "POST",
      headers: { "x-user-id": "member-bob" },
      body: docForm
    });
    assert.strictEqual(bobDocRes.status, 201, "Participant upload should return 201 Created");
    const bobDocJson = await bobDocRes.json();
    console.log(`  ✓ Document stored successfully. File ID: ${bobDocJson.fileRecord.fileId}`);

    await wait(250);
    assert(hostProjectedFiles.some((f) => f.name === "project_specifications.md"), "Host must receive participant's uploaded file");
    assert(charlieProjectedFiles.some((f) => f.name === "project_specifications.md"), "Other participant Charlie must receive uploaded file");
    console.log("  ✓ Participant's uploaded document received by host and other participants");
    results["Participant_Upload_Shared"] = true;

    // C. Late Joiner Dave connects to the room
    console.log("[Late Joiner] Dave joins after 2 files were uploaded...");
    const lateJoiner = await createClient("Late Joiner Dave");
    let lateJoinerInitData: any = null;
    lateJoiner.on("init-document", (d) => {
      lateJoinerInitData = d;
    });

    lateJoiner.emit("join-room", {
      roomId: OPEN_ROOM,
      user: { id: "member-dave", fullName: "Dave", role: "Collaborator" }
    });
    await wait(300);

    assert(lateJoinerInitData !== null, "Late joiner must receive init-document");
    assert(Array.isArray(lateJoinerInitData.projectedFiles), "init-document must contain projectedFiles array");
    assert.strictEqual(lateJoinerInitData.projectedFiles.length, 2, "Late joiner must receive both previously uploaded files");
    assert.strictEqual(lateJoinerInitData.latestProjectedFile.name, "project_specifications.md", "latestProjectedFile must point to most recent file");
    console.log("  ✓ Late joiner receives complete shared file list and latest projected file");
    results["Late_Joiner_Files_Restored"] = true;

    // D. Reconnection / REST retrieval
    console.log("[Reconnection API] Testing GET /api/documents/projected/:roomId...");
    const listRes = await fetch(`${SERVER_URL}/api/documents/projected/${OPEN_ROOM}`);
    const listJson = await listRes.json();
    assert(Array.isArray(listJson.files), "GET /projected/:roomId must return files array");
    assert.strictEqual(listJson.files.length, 2, "Must return all files for the room");
    console.log("  ✓ Reconnection file retrieval API works correctly");
    results["Reconnection_State_Restored"] = true;

    // E. Room Isolation
    console.log("[Room Isolation] Ensuring files from Room A do not leak into Room B...");
    const isolatedClient = await createClient("Isolated Client");
    let isoReceivedFiles: any[] = [];
    isolatedClient.on("project-file", (d) => isoReceivedFiles.push(d));

    isolatedClient.emit("join-room", {
      roomId: ISOLATED_ROOM,
      user: { id: "user-isolated", fullName: "Isolated User" }
    });
    await wait(200);

    const isoListRes = await fetch(`${SERVER_URL}/api/documents/projected/${ISOLATED_ROOM}`);
    const isoListJson = await isoListRes.json();
    assert.strictEqual(isoListJson.files.length, 0, "Isolated room must have 0 files");
    assert.strictEqual(isoReceivedFiles.length, 0, "Isolated room client must receive 0 file events from OPEN_ROOM");
    console.log("  ✓ Room isolation confirmed: no cross-room file leakage\n");
    results["Room_Isolation_Preserved"] = true;

    // =========================================================================
    // SECTION 3: REGRESSION TESTING — TEXT AND DRAWING SYNCHRONIZATION
    // =========================================================================
    console.log("--- SECTION 3: Regression Testing (Text & Drawing Sync) ---");

    let textSynced = false;
    let sketchSynced = false;

    openMember2.on("doc-update", (d) => {
      if (d.contentHtml?.includes("Regression Test Passed")) textSynced = true;
    });

    openMember2.on("sketch-update", (d) => {
      if (d.dataUrl?.includes("data:image/png;base64,REGRESSION")) sketchSynced = true;
    });

    openMember1.emit("doc-update", {
      roomId: OPEN_ROOM,
      contentHtml: "<p>Regression Test Passed: Text editing works bidirectionally.</p>",
      user: { id: "member-bob", fullName: "Bob" }
    });

    openMember1.emit("sketch-update", {
      roomId: OPEN_ROOM,
      targetCanvasId: "whiteboardCanvas",
      dataUrl: "data:image/png;base64,REGRESSION_SKETCH_DATA",
      user: { id: "member-bob", fullName: "Bob" }
    });

    await wait(300);
    assert(textSynced, "Bidirectional text sync must still function cleanly");
    assert(sketchSynced, "Bidirectional canvas sketch sync must still function cleanly");
    console.log("  ✓ Real-time text sync regression test passed.");
    console.log("  ✓ Real-time canvas drawing sync regression test passed.\n");
    results["Text_Sync_Regression_Passed"] = true;
    results["Drawing_Sync_Regression_Passed"] = true;

    // Cleanup sockets
    [roHost, roViewer, openHost, openMember1, openMember2, lateJoiner, isolatedClient].forEach((s) => s.disconnect());

    console.log("==========================================================================");
    console.log("  ALL TESTS PASSED! SUMMARY MATRIX:");
    console.log("==========================================================================");
    console.table(
      Object.entries(results).map(([test, passed]) => ({
        Feature: test,
        Result: passed ? "PASSED ✓" : "FAILED ✗"
      }))
    );
    console.log("\nFixes verification complete with 100% success.\n");
  } catch (err: any) {
    console.error("\n❌ TEST FAILED:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runFixesVerification();
