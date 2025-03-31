# ---- Build Stage ----
    FROM node:18-alpine AS builder

    # Set working directory
    WORKDIR /app
    
    # Copy package.json and package-lock.json (if available)
    COPY package*.json ./
    
    # Install dependencies
    RUN npm install
    
    # Copy the rest of the project
    COPY . .
    
    # Build the Next.js app.
    # Note: This uses the build command defined in package.json ("next build src/frontend")
    RUN npm run build
    
    # ---- Production Stage ----
    FROM node:18-alpine
    
    WORKDIR /app
    
    # Copy built files from builder
    COPY --from=builder /app .
    
    # Expose the production port
    EXPOSE 3000
    
    # Start the Next.js production server using the "start" script ("next start src/frontend")
    CMD ["npm", "start"]
    