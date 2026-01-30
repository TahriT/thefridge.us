# The Fridge

A lo-fi, realistic digital fridge app to pin memories, receive mail from friends/family circles, and customize your kitchen aesthetic. Features immersive kitchen scenes, video magnets, and social sharing.

## 🎯 Dual-Purpose Repository

This repository serves two purposes:

1. **Cloudflare Pages (Demo)**: A public landing page at https://thefridge.pages.dev that explains the concept and provides tutorials. No authentication or persistence required.

2. **Docker Self-Hosting (Full App)**: Complete application with user authentication, SQLite database, and all social features. See [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md) for deployment instructions.

## ✨ Features

### Visual Experience
- **Lo-Fi Realistic Kitchen Scene**: Full kitchen environment with 600x900px fridge against the wall
- **Window with Live Weather**: Shows current weather (via zipcode) or random conditions
  - Animated rain, snow, clouds, and sunshine
  - Real-time temperature display
  - Updates every 30 minutes
- **Day/Night Cycle**: Automatic lighting based on current time
  - Morning/Daytime: Bright blue sky, warm lighting
  - Evening: Orange sunset glow, softer lighting
  - Night: Dark sky, cool moonlight ambiance
- **Dynamic Lighting System**: Atmospheric light cones illuminate the scene
  - Fridge always well-lit with warm spotlight
  - Window casts natural light that changes with time
  - Adjustable ambient intensity slider
- **Multiple Wall Themes**: Subway tile, painted wall, wood panel, or retro yellow
- **Alternative 8-Bit Pixel Style**: Toggle between realistic and nostalgic pixel art aesthetics
- **Larger, Immersive Display**: Takes advantage of modern screen space

### Core Functionality
- **User Authentication**: Secure username/PIN system with SQLite storage
- **Interactive Fridge Door**: Click handle to open and access settings/mail
- **Image & Video Magnets**: Drag and drop media onto the fridge
  - Videos play on hover/tap
  - Images display as polaroid-style magnets
  - Persistent positioning and rotation
- **Double-click to Delete**: Easy magnet management

### Social Features (NEW!)
- **User Circles**: Create or join groups (family, friends, roommates)
- **Mail System**: Receive photos/videos/messages from circle members
- **Mail-to-Magnet Conversion**: Click "Add to Fridge" to pin mail items as magnets
- **Social Updates**: Share moments with your circles that appear in their fridge

### Customization
- **Fridge Color Picker**: Personalize your appliance
- **Wall Theme Selector**: 4 unique kitchen wall styles
- **Weather Zipcode**: Enter US zipcode for real weather (uses free Open-Meteo API)
- **Ambient Lighting Control**: Adjust atmospheric brightness (20-100%)
- **Handle Position**: Left or right side placement
- **Visual Style Toggle**: Realistic lo-fi or 8-bit pixel art
- **User Limits**: Default 2 magnets, 1 calendar event (configurable)

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)
```bash
docker-compose up --build
```
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:8080`

### Option 2: Run Locally
```bash
# Install dependencies
npm install

# Start backend server
node server.js

# Open in browser
# Navigate to http://localhost:3000
```

---

## 🎮 Usage Guide

### Getting Started
1. **Register**: Create account with username and PIN
2. **Login**: Access your personal kitchen
3. **Observe the Atmosphere**: 
   - Window shows current weather
   - Lighting changes with time of day
   - Cozy ambient lighting illuminates the scene
4. **Customize**: Open fridge (click handle) to change:
   - Weather zipcode (for real-time weather)
   - Ambient lighting intensity
   - Wall theme (subway tile, painted, wood, retro)
   - Visual style (realistic vs pixel art)
   - Fridge color
   - Handle position

### Adding Magnets
- **Method 1**: Click anywhere on fridge surface → file picker
- **Method 2**: Drag & drop images/videos directly onto fridge
- **Move**: Drag magnets to reposition
- **View**: Hover to see captions and play videos
- **Delete**: Double-click any magnet

### Social Features
1. **Create Circle**: Open fridge → Mail panel → "Manage Circles"
2. **Invite Members**: Add friends by username
3. **Send Mail**: Use API `POST /api/mail` with circleId and media
4. **Receive Updates**: Mail appears in your inbox
5. **Add to Fridge**: Click "📌 Add to Fridge" on any mail item with media

---

## Architecture

### Backend (Node.js + Express + SQLite)

**Database Schema:**

```sql
-- Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,  -- bcrypt hashed
    max_magnets INTEGER DEFAULT 2,
    max_calendar_events INTEGER DEFAULT 1,
    fridge_color TEXT DEFAULT '#A3D8F4',
    handle_position TEXT DEFAULT 'right',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Magnets Table
CREATE TABLE magnets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,  -- 'image' or 'video'
    caption TEXT,
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    rotation REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Circles Table (User Groups)
CREATE TABLE circles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Circle Members Table
CREATE TABLE circle_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',  -- 'admin' or 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(circle_id, user_id)
);

-- Mail Items Table
CREATE TABLE mail_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_circle_id INTEGER NOT NULL,
    subject TEXT,
    content TEXT,
    media_path TEXT,
    media_type TEXT,  -- 'image' or 'video'
    is_converted_to_magnet INTEGER DEFAULT 0,
    converted_by_user_id INTEGER,
    converted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_circle_id) REFERENCES circles(id) ON DELETE CASCADE
);

-- Calendar Events Table
CREATE TABLE calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### API Endpoints

#### Authentication
- `POST /api/register` - Create new user
  - Body: `{ username, pin }`
  - Returns: `{ userId, username }`

- `POST /api/login` - Login user
  - Body: `{ username, pin }`
  - Returns: `{ sessionId, userId, username, config }`

#### Magnets (Requires Auth)
- `GET /api/magnets` - Get all user's magnets
  - Headers: `X-Session-Id`
  - Returns: Array of magnet objects

- `POST /api/magnets` - Upload new magnet
  - Headers: `X-Session-Id`
  - Body: FormData with `file`, `caption`, `positionX`, `positionY`, `rotation`
  - Returns: Magnet object with file path

- `PUT /api/magnets/:id` - Update magnet position/caption
  - Headers: `X-Session-Id`
  - Body: `{ positionX, positionY, rotation, caption }`

- `DELETE /api/magnets/:id` - Delete magnet
  - Headers: `X-Session-Id`

#### Configuration (Requires Auth)
- `PUT /api/config` - Update user settings
  - Headers: `X-Session-Id`
  - Body: `{ fridgeColor, handlePosition }`

#### Circles (Requires Auth)
- `GET /api/circles` - Get user's circles
  - Headers: `X-Session-Id`
  - Returns: Array of circles with member counts

- `POST /api/circles` - Create new circle
  - Headers: `X-Session-Id`
  - Body: `{ name, description }`
  - Returns: Circle object

- `GET /api/circles/:id/members` - Get circle members
  - Headers: `X-Session-Id`
  - Returns: Array of member objects with usernames

- `POST /api/circles/:id/members` - Invite user to circle (Admin only)
  - Headers: `X-Session-Id`
  - Body: `{ username }`
  - Returns: Success confirmation

#### Mail System (Requires Auth)
- `GET /api/mail` - Get user's mail inbox
  - Headers: `X-Session-Id`
  - Returns: Array of mail items from all user's circles

- `POST /api/mail` - Send mail to circle
  - Headers: `X-Session-Id`
  - Body: FormData with `circleId`, `subject`, `content`, `file` (optional)
  - Returns: Mail object

- `POST /api/mail/:id/convert` - Convert mail to magnet on fridge
  - Headers: `X-Session-Id`
  - Automatically creates magnet and marks mail as converted
  - Returns: Magnet object

#### Calendar Events (Requires Auth)
- `GET /api/calendar` - Get user's calendar events
- `POST /api/calendar` - Create calendar event
  - Body: `{ title, date, description }`

---

## Usage

1. **Register**: Create an account with username and PIN
2. **Login**: Access your personal fridge
3. **Add Magnets**:
   - Click anywhere on the fridge to select files
   - Drag and drop images/videos directly onto the fridge
4. **Interact**:
   - Drag magnets to reposition them
   - Hover over magnets to see captions and play videos
   - Double-click to delete a magnet
5. **Configure**: Click the handle to open the fridge and access settings

---

---

## Future Enhancements & Complex Implementations

### 1. External Authentication (Authelia / Authentik)

To integrate enterprise-grade authentication, use a reverse proxy pattern:

**Architecture:**
```
User → Traefik/Nginx → [Authelia/Authentik] → The Fridge
```

**Nginx Configuration Example:**
```nginx
server {
    listen 80;
    server_name fridge.example.com;

    location / {
        # Forward auth to Authelia
        auth_request /auth;
        auth_request_set $user $upstream_http_remote_user;
        
        # Pass username to backend
        proxy_set_header X-User $user;
        proxy_pass http://thefridge-backend:3000;
    }

    location = /auth {
        internal;
        proxy_pass http://authelia:9091/api/verify;
    }
}
```

**Backend Changes Required:**
1. Replace session-based auth with header-based: `req.headers['x-user']`
2. Auto-create users from authenticated headers
3. Remove `/api/login` and `/api/register` endpoints

### 2. Video Thumbnail Generation

For better UX, generate video thumbnails on upload:

```javascript
const ffmpeg = require('fluent-ffmpeg');

function generateThumbnail(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['00:00:01'],
                filename: 'thumb.png',
                folder: outputPath,
                size: '200x?'
            })
            .on('end', resolve)
            .on('error', reject);
    });
}
```

### 3. Cloud Storage Integration

Replace local file storage with S3/MinIO:

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
});

async function uploadToS3(file) {
    const params = {
        Bucket: 'fridge-uploads',
        Key: `${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype
    };
    
    const result = await s3.upload(params).promise();
    return result.Location;
}
```

### 4. Real-time Collaboration (WebSockets)

For shared family fridges, add Socket.IO:

```javascript
const io = require('socket.io')(server);

io.on('connection', (socket) => {
    socket.on('magnet-moved', (data) => {
        // Broadcast to all users viewing the same fridge
        socket.to(data.userId).emit('magnet-updated', data);
    });
});
```

### 5. Calendar Integration

Extend calendar events with iCal export/import:

```javascript
const ical = require('ical-generator');

app.get('/api/calendar/export', requireAuth, async (req, res) => {
    const events = await getCalendarEvents(req.userId);
    const calendar = ical({ name: 'The Fridge' });
    
    events.forEach(event => {
        calendar.createEvent({
            start: new Date(event.date),
            summary: event.title,
            description: event.description
        });
    });
    
    res.type('text/calendar');
    res.send(calendar.toString());
});
```

### 6. Mobile App (React Native)

The API is ready for mobile integration. Key considerations:
- Use AsyncStorage for sessionId
- Implement camera capture for instant photo magnets
- Add push notifications for calendar events
- Use react-native-draggable for magnet positioning

---

## Customization Guide

### Change Fridge Colors
Edit CSS variables in [style.css](style.css#L1-L9):
```css
:root {
    --fridge-color: #A3D8F4;  /* Main fridge color */
    --frame-color: #333;       /* Border color */
    --handle-color: #eee;      /* Handle color */
    --bg-color: #5D5D5D;       /* Background */
}
```

### Adjust User Limits
Modify defaults in [server.js](server.js) database schema:
```javascript
max_magnets INTEGER DEFAULT 2,
max_calendar_events INTEGER DEFAULT 1,
```

### Change File Size Limits
In [server.js](server.js) multer configuration:
```javascript
limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
```

---

## Security Notes

⚠️ **Current Implementation:**
- Sessions stored in-memory (lost on restart)
- No rate limiting
- No CSRF protection
- Suitable for personal/development use only

**Production Recommendations:**
1. Use Redis for session storage
2. Add rate limiting (express-rate-limit)
3. Implement CSRF tokens
4. Use HTTPS only
5. Add input validation (express-validator)
6. Sanitize file uploads
7. Set proper CORS policies

---

## License

MIT - Feel free to customize and deploy!
