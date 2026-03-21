# Docker Compose Requirement

Every project MUST include a docker-compose.yml file for running the application.

## Rules:
1. Always create a Dockerfile and docker-compose.yml in the project root
2. The docker-compose.yml must expose the app port (mapped to the same host port)
3. Use multi-stage builds for compiled languages
4. Include health checks in the compose file
5. Use .dockerignore to exclude node_modules, .git, etc.

## Template for Node.js/Next.js:
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    command: npm run dev
```

## Template for Python/FastAPI:
```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - .:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Template for Go:
```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    command: ./app
```

## Template for static HTML:
```yaml
services:
  app:
    image: nginx:alpine
    ports:
      - "8000:80"
    volumes:
      - .:/usr/share/nginx/html:ro
```
