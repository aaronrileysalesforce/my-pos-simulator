# Procfile
web: node server.js

# .env (template - do not commit this file)
NODE_ENV=production
PORT=3000
SALESFORCE_ORG_ID=your_org_id_here
SALESFORCE_INSTANCE_URL=https://yourinstance.salesforce.com
SALESFORCE_API_VERSION=v58.0

# app.json (for Heroku deployment)
{
  "name": "POS Cart Simulator",
  "description": "A POS cart transaction simulator with Salesforce Loyalty API integration",
  "repository": "https://github.com/yourusername/pos-cart-simulator",
  "logo": "https://cdn.heroku.com/deploy/button.svg",
  "keywords": ["node", "express", "salesforce", "pos", "loyalty"],
  "image": "heroku/nodejs",
  "env": {
    "NODE_ENV": {
      "description": "Node environment",
      "value": "production"
    },
    "SALESFORCE_ORG_ID": {
      "description": "Salesforce Organization ID",
      "value": ""
    },
    "SALESFORCE_INSTANCE_URL": {
      "description": "Salesforce Instance URL",
      "value": "https://yourinstance.salesforce.com"
    },
    "SALESFORCE_API_VERSION": {
      "description": "Salesforce API Version",
      "value": "v58.0"
    }
  },
  "formation": {
    "web": {
      "quantity": 1,
      "size": "basic"
    }
  },
  "buildpacks": [
    {
      "url": "heroku/nodejs"
    }
  ]
}

# .gitignore
node_modules/
.env
.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.vscode/
*.log
dist/
build/
.nyc_output/
coverage/