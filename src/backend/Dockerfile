# Use an official Node image as base (LTS version)
FROM node:18

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) first to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend code
COPY . .

# Set working directory to the backend folder if needed
WORKDIR /app/src/backend

# Expose the port (adjust if necessary)
EXPOSE 2000

# Start the backend server (using tsx for ESM support)
CMD ["npx", "tsx", "server.ts"]
