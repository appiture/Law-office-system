#!/bin/bash

echo "Pulling latest code..."
git pull origin main

echo "Building backend..."
cd backend
mvn clean package -DskipTests

echo "Restarting backend service..."
sudo systemctl restart lawoffice

echo "Building frontend..."
cd ../frontend
npm install
npm run build

echo "Updating nginx web files..."
sudo rm -rf /var/www/html/*
sudo cp -r dist/* /var/www/html/

echo "Deployment complete"
