// Enhanced server.js with External Client App Support for Salesforce Loyalty Management APIs
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Salesforce External Client App Configuration
const SALESFORCE_CONFIG = {
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    username: process.env.SALESFORCE_USERNAME,
    password: process.env.SALESFORCE_PASSWORD,
    securityToken: process.env.SALESFORCE_SECURITY_TOKEN,
    instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://login.salesforce.com',
    apiVersion: process.env.SALESFORCE_API_VERSION || 'v58.0',
    loyaltyProgramId: process.env.SALESFORCE_LOYALTY_PROGRAM_ID,
    orgId: process.env.SALESFORCE_ORG_ID
};

// Store access token in memory (use Redis/database in production)
let salesforceAuth = {
    accessToken: null,
    instanceUrl: null,
    expiresAt: null,
    tokenType: 'Bearer'
};

// Salesforce External Client App Authentication
async function authenticateWithSalesforce() {
    try {
        console.log('🔐 Authenticating with Salesforce External Client App...');
        
        const authUrl = `${SALESFORCE_CONFIG.instanceUrl}/services/oauth2/token`;
        
        // OAuth 2.0 Password Flow for External Client App
        const authData = {
            grant_type: 'password',
            client_id: SALESFORCE_CONFIG.clientId,
            client_secret: SALESFORCE_CONFIG.clientSecret,
            username: SALESFORCE_CONFIG.username,
            password: SALESFORCE_CONFIG.password + SALESFORCE_CONFIG.securityToken,
            scope: 'api chatter_api refresh_token openid'
        };

        const response = await axios.post(authUrl, new URLSearchParams(authData), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        });

        const authResult = response.data;
        
        salesforceAuth = {
            accessToken: authResult.access_token,
            instanceUrl: authResult.instance_url,
            tokenType: authResult.token_type || 'Bearer',
            expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
            scope: authResult.scope,
            apiVersion: SALESFORCE_CONFIG.apiVersion
        };

        console.log('✅ External Client App authentication successful');
        console.log(`📍 Instance URL: ${salesforceAuth.instanceUrl}`);
        console.log(`🔑 Token Type: ${salesforceAuth.tokenType}`);
        console.log(`📅 Expires: ${new Date(salesforceAuth.expiresAt).toISOString()}`);
        
        return salesforceAuth;
    } catch (error) {
        console.error('❌ External Client App authentication failed:', error.response?.data || error.message);
        
        // Enhanced error messages for common External Client App issues
        if (error.response?.data?.error === 'invalid_client_id') {
            console.error('💡 Fix: Verify External Client App Consumer Key is correct');
        } else if (error.response?.data?.error === 'invalid_client') {
            console.error('💡 Fix: Ensure External Client App is deployed and OAuth is enabled');
        } else if (error.response?.data?.error === 'invalid_grant') {
            console.error('💡 Fix: Check username, password, and security token combination');
        } else if (error.response?.data?.error === 'unsupported_grant_type') {
            console.error('💡 Fix: Enable OAuth settings in External Client App');
        }
        
        throw new Error(`External Client App authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
}

// Token validation and refresh for External Client App
async function ensureValidToken() {
    if (!sales
