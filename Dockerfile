# use node 20-slim as base image
FROM node:20-slim AS builder

WORKDIR /app

# install build dependencies for native C/C++ modules and Python dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    ffmpeg \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# create Python virtual environment and install Python packages
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# copy Node.js package manifests and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# copy application source code
COPY . .

# runner stage for production runtime
FROM node:20-slim AS runner

WORKDIR /app

# install runtime dependencies for Python, OpenCV, and media libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# copy Python virtualenv and update PATH
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

ENV NODE_ENV=production
ENV PORT=3000

# copy installed modules and code from builder
COPY --from=builder /app /app

EXPOSE 3000

CMD ["npm", "start"]
