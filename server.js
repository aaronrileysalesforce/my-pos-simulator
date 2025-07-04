// POS Cart Simulator - External Client App OAuth Integration
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
    apiName: process.env.SALESFORCE_CLIENT_API_NAME, // Add API Name support
    username: process.env.SALESFORCE_USERNAME,
    password: process.env.SALESFORCE_PASSWORD,
    securityToken: process.env.SALESFORCE_SECURITY_TOKEN,
    instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://login.salesforce.com',
    apiVersion: process.env.SALESFORCE_API_VERSION || 'v58.0',
    loyaltyProgramId: process.env.SALESFORCE_LOYALTY_PROGRAM_ID,
    orgId: process.env.SALESFORCE_ORG_ID
};

// Global authentication state
let salesforceAuth = {
    accessToken: null,
    instanceUrl: null,
    expiresAt: null,
    tokenType: 'Bearer',
    authenticated: false,
    error: null,
    lastAttempt: null
};

// Validate External Client App configuration
function validateConfiguration() {
    const errors = [];
    
    if (!SALESFORCE_CONFIG.clientId) {
        errors.push('SALESFORCE_CLIENT_ID is required');
    }
    if (!SALESFORCE_CONFIG.clientSecret) {
        errors.push('SALESFORCE_CLIENT_SECRET is required');
    }
    if (!SALESFORCE_CONFIG.username) {
        errors.push('SALESFORCE_USERNAME is required');
    }
    if (!SALESFORCE_CONFIG.password) {
        errors.push('SALESFORCE_PASSWORD is required');
    }
    if (!SALESFORCE_CONFIG.securityToken) {
        errors.push('SALESFORCE_SECURITY_TOKEN is required');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors,
        configured: !!(SALESFORCE_CONFIG.clientId && SALESFORCE_CONFIG.clientSecret)
    };
}

// External Client App OAuth Authentication
async function authenticateWithSalesforce() {
    try {
        salesforceAuth.lastAttempt = new Date().toISOString();
        
        console.log('🔐 Attempting External Client App OAuth authentication...');
        
        // Validate configuration first
        const configCheck = validateConfiguration();
        if (!configCheck.valid) {
            throw new Error(`Configuration errors: ${configCheck.errors.join(', ')}`);
        }
        
        const authUrl = `${SALESFORCE_CONFIG.instanceUrl}/services/oauth2/token`;
        
        // OAuth 2.0 Password Flow for External Client App
        const authData = new URLSearchParams({
            grant_type: 'password',
            client_id: SALESFORCE_CONFIG.clientId,
            client_secret: SALESFORCE_CONFIG.clientSecret,
            username: SALESFORCE_CONFIG.username,
            password: SALESFORCE_CONFIG.password + SALESFORCE_CONFIG.securityToken,
            scope: 'api chatter_api refresh_token openid'
        });

        console.log(`📡 Authenticating with: ${authUrl}`);
        console.log(`👤 Username: ${SALESFORCE_CONFIG.username}`);
        console.log(`🔑 Client ID: ${SALESFORCE_CONFIG.clientId.substring(0, 10)}...`);

        const response = await axios.post(authUrl, authData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'User-Agent': 'POS-Simulator/2.0'
            },
            timeout: 15000
        });

        const authResult = response.data;
        
        salesforceAuth = {
            accessToken: authResult.access_token,
            instanceUrl: authResult.instance_url,
            tokenType: authResult.token_type || 'Bearer',
            expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
            scope: authResult.scope,
            authenticated: true,
            error: null,
            lastAttempt: salesforceAuth.lastAttempt
        };

        console.log('✅ External Client App OAuth authentication successful!');
        console.log(`📍 Instance: ${salesforceAuth.instanceUrl}`);
        console.log(`🔐 Token Type: ${salesforceAuth.tokenType}`);
        console.log(`📅 Expires: ${new Date(salesforceAuth.expiresAt).toISOString()}`);
        console.log(`🎯 Scope: ${salesforceAuth.scope}`);
        
        return salesforceAuth;
        
    } catch (error) {
        const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
        
        salesforceAuth = {
            ...salesforceAuth,
            accessToken: null,
            authenticated: false,
            error: errorMessage,
            lastAttempt: salesforceAuth.lastAttempt
        };
        
        console.error('❌ External Client App OAuth authentication failed:', errorMessage);
        
        // Enhanced error messages for troubleshooting
        if (error.response?.data?.error === 'invalid_client_id') {
            console.error('💡 Fix: Verify SALESFORCE_CLIENT_ID (Consumer Key) in Heroku Config Vars');
        } else if (error.response?.data?.error === 'invalid_client') {
            console.error('💡 Fix: Ensure External Client App is deployed and OAuth is enabled');
        } else if (error.response?.data?.error === 'invalid_grant') {
            console.error('💡 Fix: Check username, password, and security token combination');
        } else if (error.response?.data?.error === 'unsupported_grant_type') {
            console.error('💡 Fix: Enable OAuth password flow in External Client App');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error('💡 Fix: Check network connectivity and Salesforce instance URL');
        }
        
        throw new Error(`External Client App OAuth failed: ${errorMessage}`);
    }
}

// Token validation and refresh
async function ensureValidToken() {
    if (!salesforceAuth.accessToken || Date.now() >= salesforceAuth.expiresAt) {
        console.log('🔄 Token expired or missing, re-authenticating...');
        await authenticateWithSalesforce();
    }
    return salesforceAuth;
}

// Salesforce API call wrapper with error handling
async function callSalesforceAPI(endpoint, method = 'GET', data = null, isConnectAPI = false) {
    try {
        await ensureValidToken();
        
        const baseUrl = isConnectAPI 
            ? `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}/connect`
            : `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}`;
        
        const config = {
            method,
            url: `${baseUrl}/${endpoint}`,
            headers: {
                'Authorization': `${salesforceAuth.tokenType} ${salesforceAuth.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.data = data;
        }

        console.log(`📡 API Call: ${method} ${config.url}`);
        const response = await axios(config);
        
        return response.data;
    } catch (error) {
        console.error(`❌ Salesforce API call failed: ${method} ${endpoint}`, error.response?.data || error.message);
        
        // Handle authentication errors
        if (error.response?.status === 401) {
            console.log('🔄 Received 401, attempting re-authentication...');
            salesforceAuth.authenticated = false;
            await authenticateWithSalesforce();
            
            // Retry once with new token
            const baseUrl = isConnectAPI 
                ? `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}/connect`
                : `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}`;
            
            const retryConfig = {
                method,
                url: `${baseUrl}/${endpoint}`,
                headers: {
                    'Authorization': `${salesforceAuth.tokenType} ${salesforceAuth.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            };
            
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                retryConfig.data = data;
            }
            
            console.log(`🔁 Retrying API call with fresh token...`);
            const retryResponse = await axios(retryConfig);
            return retryResponse.data;
        }
        
        throw error;
    }
}

// Test connectivity and return status
async function testConnectivity() {
    try {
        if (!salesforceAuth.authenticated) {
            return {
                level: 'no_auth',
                message: 'Not authenticated'
            };
        }
        
        // Test basic API access
        await callSalesforceAPI('sobjects/Organization/describe');
        console.log('✅ Basic API access confirmed');
        
        // Test Loyalty Management if configured
        if (SALESFORCE_CONFIG.loyaltyProgramId) {
            try {
                await callSalesforceAPI(`sobjects/LoyaltyProgram/${SALESFORCE_CONFIG.loyaltyProgramId}`);
                console.log('✅ Loyalty Program access confirmed');
                
                // Test Connect API
                try {
                    await callSalesforceAPI(`loyaltymgmt/programs/${SALESFORCE_CONFIG.loyaltyProgramId}`, 'GET', null, true);
                    console.log('✅ Connect API access confirmed');
                    return { level: 'full_access', message: 'Full Loyalty Management access' };
                } catch (connectError) {
                    console.log('⚠️ Connect API limited, SOQL available');
                    return { level: 'soql_only', message: 'SOQL queries available, Connect API limited' };
                }
            } catch (loyaltyError) {
                console.log('⚠️ Loyalty Program access limited');
                return { level: 'basic_api', message: 'Basic Salesforce API only' };
            }
        } else {
            return { level: 'no_loyalty_config', message: 'Loyalty Program ID not configured' };
        }
    } catch (error) {
        console.error('❌ Connectivity test failed:', error.message);
        return { level: 'api_error', message: error.message };
    }
}

// API Endpoints

// Configuration endpoint
app.get('/api/config', (req, res) => {
    const configCheck = validateConfiguration();
    
    res.json({
        configured: configCheck.configured,
        authenticated: salesforceAuth.authenticated,
        orgId: SALESFORCE_CONFIG.orgId || null,
        instanceUrl: salesforceAuth.instanceUrl || SALESFORCE_CONFIG.instanceUrl,
        loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId || null,
        apiVersion: SALESFORCE_CONFIG.apiVersion,
        authMethod: 'external_client_app',
        clientApiName: SALESFORCE_CONFIG.apiName || null, // Include API Name
        tokenType: salesforceAuth.tokenType,
        scope: salesforceAuth.scope || null,
        error: salesforceAuth.error,
        lastAttempt: salesforceAuth.lastAttempt,
        configurationErrors: configCheck.valid ? null : configCheck.errors
    });
});

// Authentication status endpoint
app.get('/api/auth/status', async (req, res) => {
    try {
        const configCheck = validateConfiguration();
        
        if (!configCheck.configured) {
            return res.json({
                authenticated: false,
                configured: false,
                authMethod: 'external_client_app',
                error: 'External Client App not configured',
                configurationErrors: configCheck.errors,
                troubleshooting: {
                    step1: 'Set SALESFORCE_CLIENT_ID in Heroku Config Vars',
                    step2: 'Set SALESFORCE_CLIENT_SECRET in Heroku Config Vars',
                    step3: 'Set SALESFORCE_USERNAME (API user)',
                    step4: 'Set SALESFORCE_PASSWORD + SALESFORCE_SECURITY_TOKEN'
                }
            });
        }
        
        if (!salesforceAuth.authenticated) {
            // Attempt authentication
            try {
                await authenticateWithSalesforce();
            } catch (authError) {
                return res.json({
                    authenticated: false,
                    configured: true,
                    authMethod: 'external_client_app',
                    error: salesforceAuth.error,
                    lastAttempt: salesforceAuth.lastAttempt,
                    troubleshooting: {
                        checkCredentials: 'Verify username, password, and security token',
                        checkClientApp: 'Ensure External Client App OAuth is enabled',
                        checkPermissions: 'Verify API user has proper permissions'
                    }
                });
            }
        }
        
        // Test connectivity
        const connectivity = await testConnectivity();
        
        res.json({
            authenticated: true,
            configured: true,
            authMethod: 'external_client_app',
            instanceUrl: salesforceAuth.instanceUrl,
            tokenType: salesforceAuth.tokenType,
            expiresAt: salesforceAuth.expiresAt,
            orgId: SALESFORCE_CONFIG.orgId,
            loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId,
            connectivityLevel: connectivity.level,
            connectivityMessage: connectivity.message,
            scope: salesforceAuth.scope,
            lastAttempt: salesforceAuth.lastAttempt
        });
        
    } catch (error) {
        res.json({
            authenticated: false,
            configured: true,
            authMethod: 'external_client_app',
            error: error.message,
            lastAttempt: salesforceAuth.lastAttempt
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const configCheck = validateConfiguration();
    let authStatus = 'not_configured';
    let loyaltyStatus = 'unknown';
    let connectivity = { level: 'unknown', message: 'Not tested' };
    
    if (configCheck.configured) {
        if (salesforceAuth.authenticated) {
            authStatus = 'authenticated';
            connectivity = await testConnectivity();
            loyaltyStatus = connectivity.level;
        } else {
            authStatus = salesforceAuth.error ? 'failed' : 'not_attempted';
        }
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        server: 'running',
        configuration: {
            status: configCheck.configured ? 'configured' : 'missing',
            errors: configCheck.valid ? null : configCheck.errors
        },
        authentication: {
            status: authStatus,
            method: 'external_client_app',
            error: salesforceAuth.error,
            lastAttempt: salesforceAuth.lastAttempt
        },
        loyalty: {
            status: loyaltyStatus,
            connectivity: connectivity.level,
            message: connectivity.message
        }
    });
});

// Mock API endpoints that gracefully handle no auth
app.post('/api/salesforce/loyalty/promotions', async (req, res) => {
    try {
        if (!salesforceAuth.authenticated) {
            return res.json({
                success: false,
                error: 'External Client App not authenticated',
                mockData: true,
                promotions: [
                    {
                        id: 'MOCK_PROMO_001',
                        name: 'Demo: 10% Off Electronics',
                        type: 'percentage',
                        value: 10,
                        eligible: true,
                        description: 'Mock promotion - configure Salesforce for real data'
                    }
                ]
            });
        }
        
        // Real implementation would go here...
        res.json({
            success: true,
            authenticated: true,
            promotions: [],
            message: 'Real Salesforce integration active'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/salesforce/loyalty/vouchers', async (req, res) => {
    try {
        if (!salesforceAuth.authenticated) {
            return res.json({
                success: false,
                error: 'External Client App not authenticated',
                mockData: true,
                vouchers: []
            });
        }
        
        res.json({
            success: true,
            authenticated: true,
            vouchers: [],
            message: 'Real Salesforce integration active'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/salesforce/loyalty/transaction/execute', async (req, res) => {
    try {
        if (!salesforceAuth.authenticated) {
            return res.json({
                success: false,
                error: 'External Client App not authenticated',
                mockData: true,
                message: 'Transaction simulation - configure Salesforce for real processing'
            });
        }
        
        res.json({
            success: true,
            authenticated: true,
            message: 'Real Salesforce transaction processing active'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({
        error: 'Server error',
        message: error.message
    });
});

// Initialize and start server
async function initializeServer() {
    try {
        console.log('🚀 Starting POS Cart Simulator...');
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔧 Authentication: External Client App OAuth 2.0`);
        
        // Check configuration
        const configCheck = validateConfiguration();
        if (!configCheck.configured) {
            console.log('⚠️ External Client App not configured');
            console.log('📋 Missing variables:', configCheck.errors.join(', '));
            console.log('🔄 Starting in mock mode...');
        } else {
            console.log('✅ External Client App configuration found');
            
            // Attempt initial authentication
            try {
                await authenticateWithSalesforce();
                const connectivity = await testConnectivity();
                console.log(`🔗 Connectivity: ${connectivity.message}`);
            } catch (authError) {
                console.log('⚠️ Initial authentication failed, will retry on API calls');
                console.log(`❌ Error: ${authError.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Server initialization error:', error.message);
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`🌐 Server running on port ${PORT}`);
    await initializeServer();
    console.log(`📋 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔐 Auth Status: http://localhost:${PORT}/api/auth/status`);
    console.log('🎉 POS Cart Simulator ready!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
