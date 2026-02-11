# Build stage
FROM node:18-alpine as build-stage
WORKDIR /app

# Define build arguments for environment variables
ARG VITE_API_URL

# Set environment variables from build arguments
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
