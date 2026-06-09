const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ⚡ GOOGLE SHEETS LIVE API URL DIRECTION LINK
const GOOGLE_SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbw7OPzs7gyP7zleHnFCgKmI_924LzjX7X6MZynWrP2P7_3zEogJ8GacD1WAwSk7Nlx4ZA/exec";

let masterCachedUsersRegistry = [];
let masterCachedBookingsRegistry = [];

// Continually loops and imports your real sheet data rows every 8 seconds
async function syncDatabaseFromGoogleSheets() {
    if (!GOOGLE_SHEETS_API_URL || GOOGLE_SHEETS_API_URL.includes("PASTE_YOUR")) return;
    try {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const response = await fetch(GOOGLE_SHEETS_API_URL + "?action=getSnapshot");
        const data = await response.json();
        if (data.users) masterCachedUsersRegistry = data.users;
        if (data.bookings) masterCachedBookingsRegistry = data.bookings;
    } catch (e) {
        console.log("Database fetch layout paused:", e);
    }
}
setInterval(syncDatabaseFromGoogleSheets, 8000);
syncDatabaseFromGoogleSheets();

// LOGIN AUTHENTICATION HANDSHAKE PATHWAY
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    
    const userMatch = masterCachedUsersRegistry.find(u => 
        u.google_email.toLowerCase().trim() === cleanEmail && 
        String(u.password).trim() === String(password).trim()
    );

    if (!userMatch) {
        return res.json({ status: "error", message: "Invalid authorized email or personal security key." });
    }

    res.json({
        status: "success",
        token: "sess_" + Buffer.from(cleanEmail).toString('base64'),
        user: userMatch,
        activeTokens: userMatch.available_tokens ?? 0,
        ticker: "Chirag Master Spreadsheet Linked Live."
    });
});

// ACCOUNT REGISTRATION TO EXCEL
app.post('/api/register', async (req, res) => {
    const { email, fullName, registrationCode, password } = req.body;
    
    try {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        await fetch(GOOGLE_SHEETS_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "addRegistration",
                email: email.trim(),
                fullName: fullName.trim(),
                registrationCode: registrationCode.trim(),
                password: password.trim()
            })
        });
        setTimeout(syncDatabaseFromGoogleSheets, 1500);
        res.json({ status: "success" });
    } catch(e) {
        res.json({ status: "error", message: "Write sequence failed." });
    }
});

// LOG ENGINE ROUTE FEED
app.post('/api/fetch-logs', (req, res) => {
    res.json({ records: masterCachedBookingsRegistry });
});

// CELL SECURE BOOKING REGISTRY
app.post('/api/secure-booking', async (req, res) => {
    const { courtName, sportType, userName, date, timeSlot } = req.body;
    const bId = "BK-" + Math.floor(1000 + Math.random() * 9000);

    try {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        await fetch(GOOGLE_SHEETS_API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "secureBooking", bookingId: bId, courtName, sportType, userName, date, timeSlot })
        });
        setTimeout(syncDatabaseFromGoogleSheets, 1500);
        res.json({ status: "success" });
    } catch(e) {
        res.json({ status: "error", message: "Write sequence blocked." });
    }
});

// SNAPSHOT FOR ADMIN BOARD
app.post('/api/admin-fetch-dashboard-snapshot', (req, res) => {
    res.json({ users: masterCachedUsersRegistry, bookings: masterCachedBookingsRegistry });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 CHIRAG SPORTS BACKEND ONLINE ON PORT ${PORT}`);
});
