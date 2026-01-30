# Cloudflare Pages Deployment Guide

## Overview

This repository serves **dual purposes**:

1. **Cloudflare Pages**: Hosts a public landing page (no auth, no persistence) that explains what The Fridge is and provides self-hosting instructions
2. **Docker Self-Hosting**: Full-featured app with authentication, database persistence, and all features

## Cloudflare Pages Setup (Landing Page Only)

### Prerequisites
- Cloudflare account
- Git repository connected to Cloudflare Pages

### Deployment Steps

#### 1. Connect Repository
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create application** → **Pages** → **Connect to Git**
4. Select your repository: `TheFridge.US`

#### 2. Build Configuration
```
Build command: (leave empty)
Build output directory: /
Root directory: /
Node version: 20
```

#### 3. What Gets Deployed
- `landing.html` - Main landing page (automatically served as index)
- `_redirects` - Redirects root to landing page
- Static assets (CSS, images)
- Documentation in `/docs`

**Note**: The full app (`index.html`, `server.js`, etc.) is NOT deployed to Cloudflare Pages. These are only for self-hosting.

#### 4. Deploy
```bash
git add .
git commit -m "Deploy landing page to Cloudflare Pages"
git push
```

Cloudflare Pages will automatically build and deploy on every push.

### Manual Deploy with Wrangler

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler pages deploy . --project-name=thefridge-us
```

## Docker Self-Hosting (Full App)

For the complete application with authentication and persistence:

### Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/TheFridge.US
cd TheFridge.US

# Start with Docker Compose
docker-compose up -d
```

Access at `http://localhost:3000`

### Docker Configuration

The `docker-compose.yml` includes:
- Node.js backend server
- SQLite database with volume persistence
- File upload storage

### Environment Variables

Create `.env` file:
```
PORT=3000
SESSION_SECRET=your-secret-key-here
```

### Manual Docker Build

```bash
# Build backend
docker build -f Dockerfile.backend -t thefridge-backend .

# Run
docker run -p 3000:3000 -v $(pwd)/uploads:/app/uploads -v $(pwd)/fridge.db:/app/fridge.db thefridge-backend
```

## Architecture

```
TheFridge.US/
├── landing.html          # Cloudflare Pages landing page
├── _redirects            # Cloudflare redirects config
├── index.html            # Full app (Docker only)
├── script.js             # App logic (Docker only)
├── kitchen3d.js          # 3D rendering (Docker only)
├── server.js             # Backend API (Docker only)
├── docker-compose.yml    # Docker orchestration
├── Dockerfile.backend    # Backend container
├── wrangler.toml         # Cloudflare config
└── docs/                 # Documentation
    ├── README.md
    ├── CIRCLES_GUIDE.md
    └── ATMOSPHERE_GUIDE.md
```

## Comparison

| Feature | Cloudflare Pages | Docker Self-Host |
|---------|------------------|------------------|
| Purpose | Landing/demo page | Full application |
| Authentication | ❌ No | ✅ Yes |
| Data persistence | ❌ No | ✅ SQLite |
| Photo uploads | ❌ No | ✅ Yes |
| Social features | ❌ No | ✅ Circles & Mail |
| Cost | Free | Self-hosted |
| Setup | Git push | Docker compose |

## Custom Domain

### Cloudflare Pages
1. Go to Pages → Custom domains
2. Add your domain (e.g., `thefridge.us`)
3. DNS configured automatically

### Self-Hosted
Configure your DNS to point to your server IP, then use a reverse proxy (nginx/Caddy) with SSL.

## Monitoring

### Cloudflare Pages
- Dashboard → Pages → thefridge-us
- View deployments and analytics
- Check deployment logs

### Docker
```bash
# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

## Updating

### Cloudflare Pages
Automatically deploys on git push to main branch.

### Docker
```bash
git pull
docker-compose down
docker-compose up -d --build
```
