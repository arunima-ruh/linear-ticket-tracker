FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY tracker.js ./

# Run as non-root user
USER node

CMD ["node", "tracker.js"]
