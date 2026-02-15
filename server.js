require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'default-insecure-key';

// --- Database Setup ---
const dbPath = path.resolve(__dirname, 'globalClipboard.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.run(`CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        expiry INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        filename TEXT,
        mime_type TEXT,
        username TEXT DEFAULT 'web client'
    )`, (err) => {
        if (err) {
            console.error('Error creating table', err.message);
        } else {
            console.log('Table "uploads" initialized.');
        }
    });
}

// --- Cleanup Logic ---
function performCleanup() {
    const now = Date.now();

    // Find expired items
    db.all(`SELECT id, content, type FROM uploads WHERE expiry < ?`, [now], (err, rows) => {
        if (err) {
            console.error('Error finding expired items:', err);
            return;
        }

        if (rows.length === 0) {
            return;
        }

        console.log(`Found ${rows.length} expired items.`);

        // Delete files from disk
        rows.forEach(row => {
            if (row.type === 'file') {
                fs.unlink(row.content, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error(`Failed to delete file ${row.content}:`, err);
                    }
                });
            }
        });

        // Remove from database
        db.run(`DELETE FROM uploads WHERE expiry < ?`, [now], function (err) {
            if (err) {
                console.error('Error deleting expired items from DB:', err);
            } else {
                console.log(`Cleanup complete. Deleted ${this.changes} items.`);
            }
        });
    });
}

function startCleanupJob() {
    // Run every hour
    cron.schedule('0 * * * *', () => {
        console.log('Running cleanup job (Hourly)...');
        performCleanup();
    });
}

// Security Headers
app.set('trust proxy', 1); // Trust first proxy (Cloudflare)
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now to allow inline scripts/styles if needed (vite)
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Storage setup for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.ensureDirSync('uploads/'); // Ensure directory exists
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Middleware: API Key Authentication
const authenticateParams = (req, res, next) => {
    const providedKey = req.headers['x-api-key'] || req.query.api_key || req.cookies.auth_token;
    if (providedKey && providedKey === API_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
};

// --- Endpoints ---

// Upload Endpoint
app.post('/api/upload', upload.single('file'), authenticateParams, (req, res) => {
    const { text, expiry, username } = req.body;
    const file = req.file;

    if (!file && !text) {
        return res.status(400).json({ error: 'No file or text provided' });
    }

    const id = uuidv4();
    const type = file ? 'file' : 'text';
    const content = file ? file.path : text; // File path or text content
    const filename = file ? file.originalname : null;
    const mimeType = file ? file.mimetype : 'text/plain';
    const createdAt = Date.now();
    let expiryMinutes = parseInt(expiry) || 60; // Default to 60 minutes

    // Validate Expiry (Max 7 days = 10080 minutes)
    if (expiryMinutes < 1) expiryMinutes = 1;
    if (expiryMinutes > 10080) expiryMinutes = 10080;

    const expiryTime = createdAt + (expiryMinutes * 60 * 1000);

    // Validate Username
    let uploaderName = username || 'web client';
    if (uploaderName.length > 50) {
        uploaderName = uploaderName.substring(0, 50);
    }

    const stmt = db.prepare(`INSERT INTO uploads (id, type, content, expiry, created_at, filename, mime_type, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(id, type, content, expiryTime, createdAt, filename, mimeType, uploaderName, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        const downloadUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/download/${id}`;
        res.json({ id, url: downloadUrl, expiry: expiryTime });
    });
    stmt.finalize();
});

// List Active Items Endpoint
app.get('/api/list', authenticateParams, (req, res) => {
    const now = Date.now();
    db.all(`SELECT id, type, created_at, expiry, filename, username FROM uploads WHERE expiry > ? ORDER BY created_at DESC`, [now], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Delete Item Endpoint
app.delete('/api/delete/:id', authenticateParams, (req, res) => {
    const id = req.params.id;

    db.get(`SELECT * FROM uploads WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (row.type === 'file') {
            fs.unlink(row.content, (err) => {
                if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${row.content}:`, err);
            });
        }

        db.run(`DELETE FROM uploads WHERE id = ?`, [id], function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error deleting item' });
            }
            res.json({ message: 'Item deleted' });
        });
    });
});

// Download/View Endpoint (Public, but with UUID)
app.get('/api/download/:id', (req, res) => {
    const id = req.params.id;
    const now = Date.now();

    db.get(`SELECT * FROM uploads WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Item not found' });
        }
        if (row.expiry < now) {
            return res.status(410).json({ error: 'Item expired' });
        }

        if (row.type === 'file') {
            res.download(row.content, row.filename);
        } else {
            res.json({ text: row.content });
        }
    });
});

// Cleanup Endpoint (Can be called by cron or externally)
app.delete('/api/cleanup', authenticateParams, (req, res) => {
    performCleanup();
    res.json({ message: 'Cleanup started' });
});

// Start the automated cleanup job
startCleanupJob();

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve frontend static files
// Serve frontend
const frontendDist = path.join(__dirname, 'frontend/dist');
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false }));

    // Handle React routing, return all requests to React app
    // Express 5 regex matching to avoid "Missing parameter name" error with '*'
    app.get(/.*/, (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }

        const indexPath = path.join(frontendDist, 'index.html');
        // Check if index.html exists
        if (!fs.existsSync(indexPath)) {
            return res.status(404).send('Index file not found');
        }

        // Read and inject config
        fs.readFile(indexPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading index.html:', err);
                return res.status(500).send('Error loading frontend');
            }

            // Set Auth Cookie (HttpOnly)
            // Valid for 7 days
            res.cookie('auth_token', API_KEY, {
                httpOnly: true,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            // Send raw index.html (no injection needed)
            res.send(data);
        });
    });
} else {
    console.log("Frontend build not found. Run 'npm run build' in frontend/ to generate it.");
}


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API Key configured: ${API_KEY !== 'default-insecure-key'}`);
});
