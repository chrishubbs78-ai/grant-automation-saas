# Deployment Guide - Grant Automation SaaS

Guide for deploying the Grant Automation SaaS application to production environments.

## Pre-Deployment Checklist

Before deploying to production, ensure:

### Code Quality
- [ ] All tests pass (`npm test`)
- [ ] No console.error or console.warn in production code
- [ ] No API keys or secrets in version control
- [ ] No hardcoded URLs (use environment variables)
- [ ] Error handling implemented for all API calls
- [ ] Database migrations tested

### Configuration
- [ ] All environment variables set correctly
- [ ] Database backups configured
- [ ] API keys obtained and validated:
  - [ ] CLAUDE_API_KEY (from https://console.anthropic.com)
  - [ ] GEMINI_API_KEY (from https://ai.google.dev)
  - [ ] JWT_SECRET (strong random string)
- [ ] Log aggregation configured (if needed)
- [ ] Monitoring alerts set up

### Security
- [ ] HTTPS/TLS enabled
- [ ] CORS configured properly
- [ ] Rate limiting implemented
- [ ] SQL injection prevention verified (Sequelize ORM protects)
- [ ] XSS protection enabled (CSP headers)
- [ ] CSRF protection in place
- [ ] Database backups encrypted
- [ ] API keys rotated regularly

## Deployment Platforms

### Option 1: Vercel (Frontend) + Render (Backend) - Recommended

This is the easiest free-to-low-cost option for the tech stack.

#### Frontend Deployment (Vercel)

**Setup:**
1. Sign up at https://vercel.com
2. Connect your GitHub repository
3. Configure build settings:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Set environment variables in Vercel:
   ```
   VITE_API_URL=https://your-api.onrender.com
   ```

**Deploy:**
```bash
# Any push to main branch automatically deploys
git push origin main
```

**Expected result:**
- Frontend accessible at `https://your-app.vercel.app`
- Automatic previews for pull requests
- Automatic HTTPS

#### Backend Deployment (Render)

**Setup:**
1. Sign up at https://render.com
2. Create new Web Service
3. Connect GitHub repository (select backend directory)
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Set environment variables:
   ```
   DATABASE_URL=postgresql://user:pass@host:port/db
   JWT_SECRET=your-random-secret-key
   CLAUDE_API_KEY=sk-ant-...
   GEMINI_API_KEY=...
   NODE_ENV=production
   PORT=3000
   ```
6. Add PostgreSQL database:
   - Create new PostgreSQL database on Render
   - Copy DATABASE_URL from Render to Web Service env vars

**Deploy:**
```bash
# Push to GitHub
git push origin main
# Render automatically deploys
```

**Expected result:**
- Backend accessible at `https://your-api.onrender.com`
- Automatic HTTPS
- Auto-scaling available with paid plan

### Option 2: Docker + Cloud Run (Google Cloud)

For more control and scalability.

**Dockerfile (backend):**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app code
COPY backend/src ./src

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
```

**Deploy to Cloud Run:**
```bash
# Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/grant-api

# Deploy
gcloud run deploy grant-api \
  --image gcr.io/PROJECT_ID/grant-api \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=$DB_URL,JWT_SECRET=$JWT_SECRET
```

### Option 3: Traditional VPS (AWS EC2, DigitalOcean, Linode)

**Basic setup:**

```bash
# SSH into server
ssh ubuntu@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Clone repository
git clone your-repo /home/ubuntu/grant-automation
cd /home/ubuntu/grant-automation/backend

# Install dependencies
npm install

# Create .env file
sudo nano .env
# Add all environment variables

# Install PM2 (process manager)
sudo npm install -g pm2

# Start app
pm2 start npm --name "grant-api" -- start
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup -u ubuntu

# Setup Nginx reverse proxy
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/default
# Configure to proxy to localhost:3000
```

## Database Migration Strategy

### Development to Production

1. **Test migrations locally:**
   ```bash
   npm run dev
   # Sequelize syncs automatically
   ```

2. **Backup production database before deployment:**
   ```bash
   # Render backup: automatic (7-day free retention)
   # Manual backup:
   pg_dump postgresql://user:pass@host/db > backup.sql
   ```

3. **Run migrations in production:**
   ```bash
   # With Sequelize (automatic on startup):
   # Just restart the app, migrations run automatically
   
   # Or manual:
   NODE_ENV=production npm run migrate
   ```

4. **Verify data integrity:**
   ```bash
   psql postgresql://user:pass@host/db
   \dt  # list tables
   SELECT COUNT(*) FROM organizations;  # verify data
   ```

## Environment Variables for Production

**Required variables:**
```
# Database (from provider)
DATABASE_URL=postgresql://user:password@host:5432/grant_automation

# JWT (strong random string - DO NOT REUSE DEV SECRET)
JWT_SECRET=<generate-with-openssl>

# API Keys (from services)
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Server config
NODE_ENV=production
PORT=3000  # Render uses dynamic ports
```

**Optional variables:**
```
# Redis — enables async Bull queue for bulk operations.
# Without it, bulk jobs run synchronously (fine for single-org use).
REDIS_URL=redis://host:6379

# Default owner account (seeded into the users table on first startup)
DEFAULT_USER_EMAIL=owner@yourdomain.com
DEFAULT_USER_PASSWORD=<strong-password>  # CHANGE FROM DEFAULT IN PRODUCTION

# Auto-reapply scheduler
REAPPLY_LEAD_DAYS=60
REAPPLY_CHECK_INTERVAL_HOURS=24
```

**Generate secure JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Performance Optimization

### Frontend
- [ ] Build with `npm run build` (production optimizations)
- [ ] Enable gzip compression in Vercel
- [ ] Minify JavaScript/CSS automatically via Vite
- [ ] Use CDN for static assets

### Backend
- [ ] Use production database connection pooling
- [ ] Enable Redis caching (if needed)
- [ ] Set appropriate node process count
- [ ] Monitor memory usage
- [ ] Cache API responses when appropriate

### Database
- [ ] Add indexes on frequently queried columns
- [ ] Vacuum/analyze tables regularly
- [ ] Enable auto-vacuum
- [ ] Monitor slow queries

## Monitoring & Logging

### Application Monitoring
- **Vercel**: Built-in analytics and performance monitoring
- **Render**: Built-in logs and monitoring
- **Custom**: Add to `backend/src/app.js`:

```javascript
// Simple request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});
```

### Error Tracking
```javascript
// Simple error logging to file
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});
```

### Database Monitoring
- [ ] Monitor connection pool usage
- [ ] Track slow queries
- [ ] Monitor backup status
- [ ] Track disk space

## Backup & Recovery Strategy

### Automated Backups (Render PostgreSQL)
- 7-day free retention
- Daily automatic backups
- Point-in-time recovery available

### Manual Backups
```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20260521.sql
```

### Recovery Plan
1. Identify issue time
2. Restore from backup
3. Verify data integrity
4. Communicate with users
5. Post-mortem analysis

## SSL/TLS Certificates

**Vercel & Render:** Automatically managed with Let's Encrypt
- No configuration needed
- Auto-renewal
- Free

**Custom domain on Vercel:**
```bash
# Add domain in Vercel dashboard
# Vercel handles SSL automatically
```

## Scaling Considerations

### Horizontal Scaling (Multiple Servers)
- Load balancer (Nginx, HAProxy)
- Shared PostgreSQL database
- Shared Redis cache
- Session store in database or Redis

### Current Architecture (Single Server)
- In-memory job queue (fine for <100 users)
- Shared database
- No session persistence needed (JWT)

**When to scale:**
- >100 concurrent users
- >1000 requests/second
- Job queue backing up

**Upgrade path:**
1. Add Redis for job queue
2. Add load balancer
3. Horizontal scale backend servers
4. Scale database read replicas

## Cost Estimates

### Free Tier (Development)
- Vercel: Free (frontend)
- Render: Free (backend, limited to 750 hrs/month)
- PostgreSQL: Free on Render (100 MB storage)
- Total: **$0/month**

### Hobby Tier (5-50 users)
- Vercel: Free (frontend)
- Render: $7/month (backend)
- PostgreSQL: Free on Render
- Total: **~$7/month**

### Production Tier (50-500 users)
- Vercel: $20/month (Pro)
- Render: $25/month (Standard)
- PostgreSQL: $15/month (1 GB)
- Total: **~$60/month**

### Enterprise Tier (500+ users)
- AWS/GCP managed services
- Load balancers, auto-scaling
- Cost: **$200-1000+/month** depending on traffic

## Post-Deployment

### Monitoring
1. Check uptime and response times
2. Monitor error rates
3. Watch API quota usage (Claude, Gemini)
4. Monitor database connection pool
5. Review logs daily

### Maintenance Schedule
- Weekly: Review error logs, check backups
- Monthly: Performance analysis, security updates
- Quarterly: Dependency updates, security audit

### Update Strategy
```bash
# Test updates locally
npm update
npm test

# Deploy to staging (if available)
# Run smoke tests
# Deploy to production
git push origin main
```

## Troubleshooting Production Issues

### Backend won't start
```bash
# Check logs (Render)
# Render dashboard → Logs tab

# Check environment variables
# All required vars set?
# No typos?

# Test database connection
npm run db:test
```

### High CPU/Memory
```bash
# Check for infinite loops
# Check database slow queries
# Add caching if needed
# Scale vertically (upgrade server)
```

### Database connection failures
```bash
# Verify CONNECTION_STRING
# Check max connections not exceeded
# Restart database
# Check firewall rules
```

### API quota exceeded
```bash
# Monitor Claude/Gemini API usage
# Implement rate limiting
# Consider caching responses
# Upgrade API tier if needed
```

## Security in Production

### API Keys
- [ ] Store in environment variables only
- [ ] Rotate periodically (monthly)
- [ ] Use separate keys for dev/staging/prod
- [ ] Monitor usage for anomalies
- [ ] Never commit to git

### Database
- [ ] Enable SSL connections
- [ ] Set up firewall rules
- [ ] Enable backups
- [ ] Encrypt backups
- [ ] Monitor access logs

### HTTPS
- [ ] Enabled by default (Vercel, Render)
- [ ] Force HTTPS redirects
- [ ] Use HSTS headers
- [ ] Monitor SSL cert expiration

### Updates
- [ ] Apply security patches immediately
- [ ] Update dependencies regularly
- [ ] Monitor CVE databases
- [ ] Test updates before deploying

## Support & Escalation

### For Render Issues
https://render.com/support

### For Vercel Issues
https://vercel.com/support

### For Claude API Issues
https://console.anthropic.com/help

### For Gemini API Issues
https://ai.google.dev/help

## Next Steps

1. Choose deployment platform (Vercel + Render recommended)
2. Set up accounts and create free tier projects
3. Connect repositories
4. Add environment variables
5. Deploy and test
6. Set up monitoring
7. Plan backup/recovery strategy
8. Schedule regular maintenance

## Further Reading

- [Vercel Deployment Documentation](https://vercel.com/docs)
- [Render Deployment Documentation](https://render.com/docs)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance/)
- [PostgreSQL Production Guide](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [12 Factor App](https://12factor.net/)
