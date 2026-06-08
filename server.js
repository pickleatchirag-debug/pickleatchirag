const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

const GOOGLE_BRIDGE_URL = "https://script.google.com/macros/s/AKfycbyfJbTptFGBpBOHdeVjbmsichGaAmhvToils0KamJsHSwNUwaL37vFr31Hegtsz8RxuQw/exec";

app.use(express.json());
app.use(express.static(__dirname));

let systemTickerState = { global: "Welcome to the Pickle at Chirag Portal! Use your secure password to manage your active booking.", targeted: {} };

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

function getIndianStandardTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function cleanSheetDate(dateInput) {
    if (!dateInput) return "";
    let str = dateInput.toString().trim();
    if (str.includes('T') || str.includes('-')) {
        let d = new Date(str);
        if (!isNaN(d.getTime())) {
            let localIST = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            return `${String(localIST.getDate()).padStart(2, '0')}/${String(localIST.getMonth() + 1).padStart(2, '0')}/${localIST.getFullYear()}`;
        }
    }
    return str;
}

function buildAbsoluteDateObject(dateStr, timeSlotStr) {
    try {
        const [d, m, y] = dateStr.split('/');
        const [startHourStr] = timeSlotStr.split(' - ');
        const [hour, minutes] = startHourStr.split(':');
        return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hour, 10), parseInt(minutes || 0, 10), 0);
    } catch(e) { return new Date(); }
}

function extractNormalizedAssetToken(name) {
    if(!name) return "";
    let str = name.toString().toLowerCase().trim();
    let prefix = (str.includes("badminton") || str.includes("bd")) ? "bd" : "pb";
    let numbers = str.replace(/[^0-9]/g, '');
    return prefix + (numbers.length > 0 ? numbers.charAt(0) : "1");
}

async function sendToSheetBridge(payload) {
    try {
        const response = await fetch(GOOGLE_BRIDGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow'
        });
        return await response.json();
    } catch (err) { return { status: "error", message: "Database connection dropped." }; }
}

async function verifyAdminCredentialAgainstDatabase(inputPassword) {
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Admin_Directory`, { method: 'GET', redirect: 'follow' });
        const admins = await response.json();
        return admins.some(a => a.password && a.password.toString().trim() === inputPassword.toString().trim());
    } catch(e) { return false; }
}

// 🔐 ADMIN VERIFICATION GATEWAY
app.post('/api/admin/verify-gate', async (req, res) => {
    const { adminPass } = req.body;
    if (await verifyAdminCredentialAgainstDatabase(adminPass)) return res.json({ status: "success" });
    res.json({ status: "error", message: "Security Gate Refusal: Invalid Administrative Password." });
});

app.post('/api/admin/directory', async (req, res) => {
    const { adminPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Invalid Password." });
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Member_Directory`, { method: 'GET', redirect: 'follow' });
        res.json({ status: "success", members: await response.json() });
    } catch(e) { res.json({ status: "error", members: [] }); }
});

app.post('/api/admin/update-tokens', async (req, res) => {
    const { email, tokenCount, adminPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Invalid Password." });
    res.json(await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "custom_tokens", updateValue: tokenCount }));
});

app.post('/api/admin/list-managers', async (req, res) => {
    const { adminPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Denied Access" });
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Admin_Directory`, { method: 'GET', redirect: 'follow' });
        res.json({ status: "success", admins: await response.json() });
    } catch(e) { res.json({ status: "error", admins: [] }); }
});

app.post('/api/admin/add-manager', async (req, res) => {
    const { adminPass, newName, newEmail, newPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Denied Access" });
    const newId = "ADMIN_" + Math.floor(10000 + Math.random() * 90000);
    res.json(await sendToSheetBridge({ tabName: "Admin_Directory", data: [newId, newName, newEmail, "admin", newPass] }));
});

app.post('/api/admin/change-password', async (req, res) => {
    const { adminPass, targetEmail, newPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Denied Access" });
    res.json(await sendToSheetBridge({ action: "updateRow", tabName: "Admin_Directory", keyColumn: "google_email", keyValue: targetEmail, updateColumn: "password", updateValue: newPass }));
});

app.post('/api/admin/update-access', async (req, res) => {
    const { email, targetStatus, adminPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Invalid Password." });
    res.json(await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "is_access_enabled", updateValue: targetStatus }));
});

app.post('/api/admin/remove-whitelist', async (req, res) => {
    const { email, adminPass } = req.body;
    if (!(await verifyAdminCredentialAgainstDatabase(adminPass))) return res.json({ status: "error", message: "Invalid Password." });
    res.json(await sendToSheetBridge({ action: "deleteRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email }));
});

// 🔑 MEMBER SIGNUP ENGINE (ADDED AND CONNECTED)
app.post('/api/register', async (req, res) => {
    const { email, fullName, registrationCode, password } = req.body;
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Member_Directory`, { method: 'GET', redirect: 'follow' });
        const members = await response.json();
        
        const userRow = members.find(m => m.google_email.toLowerCase().trim() === email.toLowerCase().trim());
        if (!userRow) return res.json({ status: "error", message: "This email address is not whitelisted by management." });

        const alreadyRegistered = userRow.is_registered && (userRow.is_registered.toString().toUpperCase() === "TRUE" || userRow.is_registered === true);
        if (alreadyRegistered) return res.json({ status: "error", message: "This account has already been initialized. Please use the log-in console." });

        // Batch update information rows to Google Sheets
        await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "full_name", updateValue: fullName });
        await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "joining_code", updateValue: registrationCode });
        await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "password", updateValue: password });
        let finalResult = await sendToSheetBridge({ action: "updateRow", tabName: "Member_Directory", keyColumn: "google_email", keyValue: email, updateColumn: "is_registered", updateValue: "TRUE" });
        
        res.json(finalResult);
    } catch(e) { res.json({ status: "error", message: "An error occurred during account initialization." }); }
});

// 🔑 MEMBER LOGIN ENGINE
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Member_Directory`, { method: 'GET', redirect: 'follow' });
        const members = await response.json();
        const user = members.find(m => m.google_email.toLowerCase().trim() === email.toLowerCase().trim());
        
        if (!user) return res.json({ status: "error", message: "Email not whitelisted." });
        const reg = user.is_registered && (user.is_registered.toString().toUpperCase() === "TRUE" || user.is_registered === true);
        if (!reg || !user.password) return res.json({ status: "error", message: "Account configuration incomplete." });
        if (user.password.toString().trim() !== password.toString().trim()) return res.json({ status: "error", message: "Invalid password." });
        if (user.is_access_enabled.toString().toUpperCase() !== "ENABLED") return res.json({ status: "error", message: "Account locked." });
        
        const logsRes = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=RealTime_bookings_log`, { method: 'GET', redirect: 'follow' });
        let logs = await logsRes.json();
        const nowIST = getIndianStandardTime();
        
        const activeBookings = logs.filter(b => b.booked_by === user.full_name).filter(b => {
            let sanDate = cleanSheetDate(b.date);
            return sanDate.includes('/') && buildAbsoluteDateObject(sanDate, b.time_slot) > nowIST;
        });

        let maxTokensAllowed = (user.custom_tokens !== undefined && user.custom_tokens !== "") ? parseInt(user.custom_tokens, 10) : 2;
        let tokensRemaining = maxTokensAllowed - activeBookings.length;
        if(tokensRemaining < 0) tokensRemaining = 0;

        res.json({ status: "success", user, activeTokens: tokensRemaining, ticker: systemTickerState.targeted[user.id] || systemTickerState.global });
    } catch(e) { res.json({ status: "error", message: "Authentication failure." }); }
});

app.post('/api/fetch-logs', async (req, res) => {
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=RealTime_bookings_log`, { method: 'GET', redirect: 'follow' });
        let records = await response.json();
        let sanitized = records.map(r => { r.date = cleanSheetDate(r.date); return r; });
        res.json({ status: "success", records: sanitized });
    } catch(e) { res.json({ status: "success", records: [] }); }
});

app.post('/api/secure-booking', async (req, res) => {
    const { courtName, sportType, userName, date, timeSlot, adminPass } = req.body;
    if (adminPass !== undefined && !(await verifyAdminCredentialAgainstDatabase(adminPass))) {
        return res.json({ status: "error", message: "Security Gate Refusal: Invalid Password." });
    }
    try {
        const response = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=RealTime_bookings_log`, { method: 'GET', redirect: 'follow' });
        const logs = await response.json();
        const nowIST = getIndianStandardTime();
        
        const targetToken = extractNormalizedAssetToken(courtName);
        const globalConflict = logs.some(b => {
            return extractNormalizedAssetToken(b.court_name) === targetToken && 
                   cleanSheetDate(b.date) === date && 
                   b.time_slot.trim() === timeSlot.trim();
        });
        if (globalConflict) return res.json({ status: "error", message: "Slot already claimed by another member." });

        if (adminPass === undefined) {
            const dirRes = await fetch(`${GOOGLE_BRIDGE_URL}?action=readTab&tabName=Member_Directory`, { method: 'GET', redirect: 'follow' });
            const directory = await dirRes.json();
            const matchingUser = directory.find(m => m.full_name === userName);

            const activeBookingsCount = logs.filter(b => b.booked_by.trim() === userName.trim()).filter(b => {
                let sanDate = cleanSheetDate(b.date);
                return sanDate.includes('/') && buildAbsoluteDateObject(sanDate, b.time_slot) > nowIST;
            }).length;

            let tokenCap = (matchingUser && matchingUser.custom_tokens !== undefined && matchingUser.custom_tokens !== "") ? parseInt(matchingUser.custom_tokens, 10) : 2;
            
            if (activeBookingsCount >= tokenCap) {
                return res.json({ status: "error", message: `Booking Refused: You have exhausted your active reservation token limit (${activeBookingsCount}/${tokenCap} used).` });
            }
        }
    } catch(e) { return res.json({ status: "error", message: "Validation error." }); }

    res.json(await sendToSheetBridge({ tabName: "RealTime_bookings_log", data: ["BK_" + Math.floor(10000 + Math.random() * 90000), courtName, sportType, userName, "'" + date, timeSlot, getIndianStandardTime().toLocaleString()] }));
});

app.post('/api/release-booking', async (req, res) => {
    const { bookingId, adminPass } = req.body;
    if (adminPass !== undefined && !(await verifyAdminCredentialAgainstDatabase(adminPass))) {
        return res.json({ status: "error", message: "Security Gate Refusal: Invalid Password." });
    }
    res.json(await sendToSheetBridge({ action: "deleteRow", tabName: "RealTime_bookings_log", keyColumn: "booking_id", keyValue: bookingId }));
});

app.post('/api/admin/authorize-member', async (req, res) => {
    const { email } = req.body;
    const newId = "USER_" + Math.floor(10000 + Math.random() * 90000);
    res.json(await sendToSheetBridge({ tabName: "Member_Directory", data: [newId, "Pending Signup", email.toLowerCase().trim(), "----", "01/01/2026", "01/01/2027", "ENABLED", "PAID", "", "FALSE", "2"] }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Core Portal Operating Server online on port ${PORT}`));