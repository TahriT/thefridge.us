const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Database setup
const db = new sqlite3.Database('./fridge.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                pin TEXT NOT NULL,
                max_magnets INTEGER DEFAULT 2,
                max_calendar_events INTEGER DEFAULT 1,
                fridge_color TEXT DEFAULT '#A3D8F4',
                handle_position TEXT DEFAULT 'right',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Magnets table
        db.run(`
            CREATE TABLE IF NOT EXISTS magnets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT NOT NULL,
                caption TEXT,
                position_x REAL DEFAULT 0,
                position_y REAL DEFAULT 0,
                rotation REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Calendar events table
        db.run(`
            CREATE TABLE IF NOT EXISTS calendar_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Circles table (user groups for sharing)
        db.run(`
            CREATE TABLE IF NOT EXISTS circles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Circle members table
        db.run(`
            CREATE TABLE IF NOT EXISTS circle_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                circle_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT DEFAULT 'member',
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(circle_id, user_id)
            )
        `);

        // Mail items table (messages/media sent to circles)
        db.run(`
            CREATE TABLE IF NOT EXISTS mail_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user_id INTEGER NOT NULL,
                to_circle_id INTEGER NOT NULL,
                subject TEXT,
                content TEXT,
                media_path TEXT,
                media_type TEXT,
                is_converted_to_magnet INTEGER DEFAULT 0,
                converted_by_user_id INTEGER,
                converted_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (to_circle_id) REFERENCES circles(id) ON DELETE CASCADE,
                FOREIGN KEY (converted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        console.log('Database tables initialized');
    });
}

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|mov/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images and videos are allowed'));
    }
});

// === AUTH ENDPOINTS ===

// Simple session storage (in-memory, for demo - use Redis/JWT in production)
const sessions = new Map();

app.post('/api/register', async (req, res) => {
    const { username, pin } = req.body;
    
    if (!username || !pin) {
        return res.status(400).json({ error: 'Username and PIN required' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    db.run(
        'INSERT INTO users (username, pin) VALUES (?, ?)',
        [username, hashedPin],
        function(err) {
            if (err) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            res.json({ userId: this.lastID, username });
        }
    );
});

app.post('/api/login', async (req, res) => {
    const { username, pin } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(pin, user.pin);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const sessionId = Math.random().toString(36).substr(2);
        sessions.set(sessionId, user.id);

        res.json({
            sessionId,
            userId: user.id,
            username: user.username,
            config: {
                fridgeColor: user.fridge_color,
                handlePosition: user.handle_position,
                maxMagnets: user.max_magnets,
                maxCalendarEvents: user.max_calendar_events
            }
        });
    });
});

// Middleware to check session
function requireAuth(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.userId = userId;
    next();
}

// === MAGNET ENDPOINTS ===

app.get('/api/magnets', requireAuth, (req, res) => {
    db.all(
        'SELECT * FROM magnets WHERE user_id = ? ORDER BY created_at DESC',
        [req.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

app.post('/api/magnets', requireAuth, upload.single('file'), (req, res) => {
    const { caption, positionX, positionY, rotation } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get current magnet count for response
    db.get(
        'SELECT COUNT(*) as count FROM magnets WHERE user_id = ?',
        [req.userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const currentCount = row ? row.count : 0;
            const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
            
            db.run(
                `INSERT INTO magnets (user_id, file_path, file_type, caption, position_x, position_y, rotation) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [req.userId, req.file.filename, fileType, caption || req.file.originalname, positionX || 0, positionY || 0, rotation || 0],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    res.json({
                        id: this.lastID,
                        filePath: req.file.filename,
                        fileType,
                        caption: caption || req.file.originalname,
                        positionX: positionX || 0,
                        positionY: positionY || 0,
                        rotation: rotation || 0,
                        totalMagnets: currentCount + 1
                    });
                }
            );
        }
    );
});

app.put('/api/magnets/:id', requireAuth, (req, res) => {
    const { positionX, positionY, rotation, caption } = req.body;
    
    db.run(
        `UPDATE magnets 
         SET position_x = ?, position_y = ?, rotation = ?, caption = ?
         WHERE id = ? AND user_id = ?`,
        [positionX, positionY, rotation, caption, req.params.id, req.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ updated: this.changes });
        }
    );
});

app.delete('/api/magnets/:id', requireAuth, (req, res) => {
    // Get file path first
    db.get(
        'SELECT file_path FROM magnets WHERE id = ? AND user_id = ?',
        [req.params.id, req.userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (row) {
                // Delete file
                const filePath = path.join(__dirname, 'uploads', row.file_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            db.run(
                'DELETE FROM magnets WHERE id = ? AND user_id = ?',
                [req.params.id, req.userId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ deleted: this.changes });
                }
            );
        }
    );
});

// === CONFIG ENDPOINTS ===

app.put('/api/config', requireAuth, (req, res) => {
    const { fridgeColor, handlePosition } = req.body;
    
    db.run(
        'UPDATE users SET fridge_color = ?, handle_position = ? WHERE id = ?',
        [fridgeColor, handlePosition, req.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ updated: true });
        }
    );
});

// === CALENDAR ENDPOINTS ===

app.get('/api/calendar', requireAuth, (req, res) => {
    db.all(
        'SELECT * FROM calendar_events WHERE user_id = ? ORDER BY date ASC',
        [req.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

app.post('/api/calendar', requireAuth, (req, res) => {
    const { title, date, description } = req.body;

    db.get(
        'SELECT COUNT(*) as count FROM calendar_events WHERE user_id = ?',
        [req.userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            db.get('SELECT max_calendar_events FROM users WHERE id = ?', [req.userId], (err, user) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                if (row.count >= user.max_calendar_events) {
                    return res.status(400).json({ error: `Maximum ${user.max_calendar_events} calendar event allowed` });
                }

                db.run(
                    'INSERT INTO calendar_events (user_id, title, date, description) VALUES (?, ?, ?, ?)',
                    [req.userId, title, date, description],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({ id: this.lastID, title, date, description });
                    }
                );
            });
        }
    );
});

// === CIRCLES ENDPOINTS ===

app.get('/api/circles', requireAuth, (req, res) => {
    const query = `
        SELECT DISTINCT c.*, 
               (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id) as member_count
        FROM circles c
        LEFT JOIN circle_members cm ON c.id = cm.circle_id
        WHERE cm.user_id = ? OR c.created_by = ?
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [req.userId, req.userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/circles', requireAuth, (req, res) => {
    const { name, description } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Circle name required' });
    }

    db.run(
        'INSERT INTO circles (name, description, created_by) VALUES (?, ?, ?)',
        [name, description, req.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const circleId = this.lastID;
            
            // Auto-add creator as admin
            db.run(
                'INSERT INTO circle_members (circle_id, user_id, role) VALUES (?, ?, ?)',
                [circleId, req.userId, 'admin'],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ id: circleId, name, description, created_by: req.userId });
                }
            );
        }
    );
});

app.get('/api/circles/:id/members', requireAuth, (req, res) => {
    // Check if user is in circle
    db.get(
        'SELECT * FROM circle_members WHERE circle_id = ? AND user_id = ?',
        [req.params.id, req.userId],
        (err, membership) => {
            if (err || !membership) {
                return res.status(403).json({ error: 'Not a member of this circle' });
            }

            db.all(
                `SELECT cm.*, u.username 
                 FROM circle_members cm 
                 JOIN users u ON cm.user_id = u.id 
                 WHERE cm.circle_id = ?`,
                [req.params.id],
                (err, rows) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json(rows);
                }
            );
        }
    );
});

app.post('/api/circles/:id/members', requireAuth, (req, res) => {
    const { username } = req.body;
    
    // Check if requester is admin
    db.get(
        'SELECT * FROM circle_members WHERE circle_id = ? AND user_id = ? AND role = ?',
        [req.params.id, req.userId, 'admin'],
        (err, admin) => {
            if (err || !admin) {
                return res.status(403).json({ error: 'Only admins can invite members' });
            }

            // Find user by username
            db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
                if (err || !user) {
                    return res.status(404).json({ error: 'User not found' });
                }

                db.run(
                    'INSERT INTO circle_members (circle_id, user_id, role) VALUES (?, ?, ?)',
                    [req.params.id, user.id, 'member'],
                    function(err) {
                        if (err) {
                            return res.status(400).json({ error: 'User already in circle or invalid' });
                        }
                        res.json({ success: true, userId: user.id, username });
                    }
                );
            });
        }
    );
});

// === MAIL ENDPOINTS ===

app.get('/api/mail', requireAuth, (req, res) => {
    const query = `
        SELECT m.*, u.username as from_username, c.name as circle_name
        FROM mail_items m
        JOIN users u ON m.from_user_id = u.id
        JOIN circles c ON m.to_circle_id = c.id
        JOIN circle_members cm ON c.id = cm.circle_id
        WHERE cm.user_id = ?
        ORDER BY m.created_at DESC
        LIMIT 50
    `;
    
    db.all(query, [req.userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/mail', requireAuth, upload.single('file'), (req, res) => {
    const { circleId, subject, content } = req.body;
    
    if (!circleId) {
        return res.status(400).json({ error: 'Circle ID required' });
    }

    // Check if user is in circle
    db.get(
        'SELECT * FROM circle_members WHERE circle_id = ? AND user_id = ?',
        [circleId, req.userId],
        (err, membership) => {
            if (err || !membership) {
                return res.status(403).json({ error: 'Not a member of this circle' });
            }

            const mediaPath = req.file ? req.file.filename : null;
            const mediaType = req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : null;

            db.run(
                `INSERT INTO mail_items (from_user_id, to_circle_id, subject, content, media_path, media_type) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.userId, circleId, subject, content, mediaPath, mediaType],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({
                        id: this.lastID,
                        from_user_id: req.userId,
                        to_circle_id: circleId,
                        subject,
                        content,
                        media_path: mediaPath,
                        media_type: mediaType
                    });
                }
            );
        }
    );
});

app.post('/api/mail/:id/convert', requireAuth, (req, res) => {
    // Get mail item
    db.get(
        `SELECT m.*, cm.user_id 
         FROM mail_items m
         JOIN circle_members cm ON m.to_circle_id = cm.circle_id
         WHERE m.id = ? AND cm.user_id = ?`,
        [req.params.id, req.userId],
        (err, mail) => {
            if (err || !mail) {
                return res.status(404).json({ error: 'Mail not found or no access' });
            }

            if (!mail.media_path) {
                return res.status(400).json({ error: 'Mail has no media to convert' });
            }

            // Create magnet from mail (no limit)
            const caption = mail.subject || mail.content || 'Mail from ' + mail.from_username;
            
            db.run(
                `INSERT INTO magnets (user_id, file_path, file_type, caption, position_x, position_y, rotation) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [req.userId, mail.media_path, mail.media_type, caption, 
                 Math.random() * 400, Math.random() * 700, Math.random() * 30 - 15],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    // Mark mail as converted
                    db.run(
                        'UPDATE mail_items SET is_converted_to_magnet = 1, converted_by_user_id = ?, converted_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [req.userId, mail.id],
                        (err) => {
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            
                            res.json({
                                magnetId: this.lastID,
                                filePath: mail.media_path,
                                fileType: mail.media_type,
                                caption
                            });
                        }
                    );
                }
            );
        }
    );
});

// Serve frontend
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
