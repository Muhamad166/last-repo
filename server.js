const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// =======================
//  DATABASE (SQLite)
// =======================
const db = new sqlite3.Database("./database.db");

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        last_active INTEGER
    )
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        receiver TEXT,
        type TEXT,
        content TEXT,
        timestamp INTEGER
    )
    `);
});

// =======================
//  FILE UPLOAD (AUDIO)
// =======================
const upload = multer({ dest: "uploads/" });

app.post("/upload_audio", upload.single("audio"), (req, res) => {
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
//  REST API (GET MESSAGES)
// =======================
app.get("/messages", (req, res) => {
    const { user1, user2 } = req.query;

    db.all(
        `SELECT * FROM messages
        WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)
        ORDER BY timestamp ASC`,
        [user1, user2, user2, user1],
        (err, rows) => {
            res.json(rows);
        }
    );
});

// =======================
//  WEBSOCKET SERVER
// =======================
wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "register") {
            db.run(
                `INSERT OR REPLACE INTO users (id, name, last_active) VALUES (?, ?, ?)`,
                   [data.id, data.name, Date.now()]
            );
        }

        if (data.type === "message") {
            db.run(
                `INSERT INTO messages (sender, receiver, type, content, timestamp)
                VALUES (?, ?, ?, ?, ?)`,
                   [
                       data.sender,
                   data.receiver,
                   data.msg_type,
                   data.content,
                   Date.now()
                   ]
            );

            // إرسال الرسالة للطرف الآخر
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    });
});

// =======================
//  START SERVER
// =======================
server.listen(3000, () => {
    console.log("Server running on port 3000");
});
