const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
res.json({
success: true,
message: 'Render server running'
});
});

app.get('*', (req, res) => {
res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
