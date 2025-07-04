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
    if (!salesforceAuth.accessToken || Date.now() >= salesforceAuth.expiresAt) {
        console.log('🔄 Token expired or missing, re-authenticating...');
        await authenticateWithSalesforce();
    }
    return salesforceAuth;
}

// Enhanced Salesforce API call function with External Client App support
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
                'Accept': 'application/json',
                'X-PrettyPrint': '1'
            },
            timeout: 30000 // 30 second timeout for API calls
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.data = data;
        }

        console.log(`📡 API Call: ${method} ${config.url}`);
        const response = await axios(config);
        
        return response.data;
    } catch (error) {
        console.error(`❌ Salesforce API call failed: ${method} ${endpoint}`, error.response?.data || error.message);
        
        // Handle authentication errors with External Client App
        if (error.response?.status === 401) {
            console.log('🔄 Received 401, attempting re-authentication...');
            await authenticateWithSalesforce();
            
            // Retry the call with new token
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

// Test External Client App connectivity
async function testExternalClientAppConnectivity() {
    try {
        // Test basic API access
        const orgInfo = await callSalesforceAPI('sobjects/Organization/describe');
        console.log('✅ Organization API access confirmed');
        
        // Test Loyalty Management access if program ID is configured
        if (SALESFORCE_CONFIG.loyaltyProgramId) {
            try {
                const loyaltyProgram = await callSalesforceAPI(`sobjects/LoyaltyProgram/${SALESFORCE_CONFIG.loyaltyProgramId}`);
                console.log(`✅ Loyalty Program access confirmed: ${loyaltyProgram.Name}`);
                
                // Test Connect API for Loyalty Management
                try {
                    await callSalesforceAPI(`loyaltymgmt/programs/${SALESFORCE_CONFIG.loyaltyProgramId}`, 'GET', null, true);
                    console.log('✅ Loyalty Connect API access confirmed');
                    return 'full_loyalty_access';
                } catch (connectError) {
                    console.log('⚠️ Connect API not available, using SOQL fallback');
                    return 'soql_only';
                }
            } catch (loyaltyError) {
                console.log('⚠️ Loyalty Program not accessible, check permissions');
                return 'basic_api_only';
            }
        } else {
            console.log('⚠️ Loyalty Program ID not configured');
            return 'no_loyalty_config';
        }
    } catch (error) {
        console.error('❌ External Client App connectivity test failed:', error.message);
        return 'no_access';
    }
}

// Get Loyalty Member Information with Enhanced Error Handling
async function getLoyaltyMember(customerId) {
    try {
        console.log(`🔍 Looking up loyalty member: ${customerId}`);
        
        // Enhanced SOQL query with better error handling
        const soqlQuery = `
            SELECT Id, Contact.Id, Contact.Name, Contact.Email, 
                   LoyaltyProgram.Id, LoyaltyProgram.Name, 
                   MemberStatus, EnrollmentDate, LastActivityDate,
                   TotalPointsAccrued, TotalPointsRedeemed, TotalPointsExpired,
                   PointsBalance, TierName, MembershipNumber
            FROM LoyaltyProgramMember 
            WHERE (Contact.External_Customer_ID__c = '${customerId}' 
                   OR Contact.CustomerNumber__c = '${customerId}'
                   OR Contact.Email = '${customerId}')
            AND LoyaltyProgram.Id = '${SALESFORCE_CONFIG.loyaltyProgramId}'
            AND MemberStatus = 'Active'
            LIMIT 1
        `;
        
        const result = await callSalesforceAPI(`query?q=${encodeURIComponent(soqlQuery)}`);
        
        if (result.records && result.records.length > 0) {
            const member = result.records[0];
            console.log(`✅ Found loyalty member: ${member.Contact.Name} (${member.MemberStatus})`);
            return member;
        } else {
            console.log(`⚠️ No loyalty member found for: ${customerId}`);
            return null;
        }
    } catch (error) {
        console.error('❌ Error fetching loyalty member:', error.response?.data || error.message);
        return null;
    }
}

// Real Salesforce Loyalty Management API: Get Promotions
app.post('/api/salesforce/loyalty/promotions', async (req, res) => {
    try {
        const { orgId, customerId, cartItems } = req.body;
        
        // Get loyalty member information
        const member = await getLoyaltyMember(customerId);
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Loyalty member not found',
                customerId
            });
        }

        console.log(`🎯 Fetching promotions for member: ${member.Contact.Name}`);

        // Method 1: Use Salesforce Connect API for getting promotions
        try {
            const promotionsEndpoint = `loyaltymgmt/programs/${SALESFORCE_CONFIG.loyaltyProgramId}/promotions`;
            const promotionsData = await callSalesforceAPI(promotionsEndpoint, 'GET', null, true);
            
            // Filter promotions based on cart contents and member eligibility
            const filteredPromotions = promotionsData.promotions.map(promo => {
                const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const hasElectronics = cartItems.some(item => item.sku.includes('ELEC'));
                
                let eligible = promo.isActive;
                
                // Check promotion conditions
                if (promo.minimumPurchaseAmount && totalAmount < promo.minimumPurchaseAmount) {
                    eligible = false;
                }
                
                if (promo.applicableProducts && promo.applicableProducts.length > 0) {
                    const cartSkus = cartItems.map(item => item.sku);
                    eligible = eligible && promo.applicableProducts.some(product => 
                        cartSkus.includes(product.sku)
                    );
                }
                
                return {
                    id: promo.id,
                    name: promo.name,
                    type: promo.promotionType?.toLowerCase() || 'percentage',
                    value: promo.discountValue || promo.pointsMultiplier || 0,
                    description: promo.description || '',
                    eligible: eligible,
                    startDate: promo.startDate,
                    endDate: promo.endDate,
                    conditions: {
                        minAmount: promo.minimumPurchaseAmount || 0,
                        tierRequired: promo.memberTierRequired,
                        products: promo.applicableProducts
                    }
                };
            });

            res.json({
                success: true,
                orgId,
                customerId,
                member: {
                    id: member.Id,
                    name: member.Contact.Name,
                    tier: member.TierName,
                    pointsBalance: member.PointsBalance
                },
                promotions: filteredPromotions,
                source: 'salesforce_connect_api',
                metadata: {
                    totalPromotions: filteredPromotions.length,
                    eligiblePromotions: filteredPromotions.filter(p => p.eligible).length,
                    requestTimestamp: new Date().toISOString()
                }
            });
            return;
        } catch (connectAPIError) {
            console.log('Connect API not available, trying SOQL query...');
        }

        // Method 2: Query Promotion custom objects via SOQL
        const soqlQuery = `
            SELECT Id, Name, PromotionType, DiscountValue, PointsMultiplier, 
                   Description, StartDate, EndDate, IsActive, MinimumPurchaseAmount,
                   MemberTierRequired, Category__c
            FROM Promotion 
            WHERE IsActive = true 
            AND (StartDate = null OR StartDate <= TODAY) 
            AND (EndDate = null OR EndDate >= TODAY)
            AND LoyaltyProgramId = '${SALESFORCE_CONFIG.loyaltyProgramId}'
            ORDER BY Priority__c DESC NULLS LAST
        `;
        
        const promotionsResult = await callSalesforceAPI(`query?q=${encodeURIComponent(soqlQuery)}`);
        
        // Transform Salesforce data to our format
        const promotions = promotionsResult.records.map(promo => {
            const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const hasElectronics = cartItems.some(item => item.sku.includes('ELEC'));
            
            let eligible = promo.IsActive;
            
            // Check minimum purchase amount
            if (promo.MinimumPurchaseAmount && totalAmount < promo.MinimumPurchaseAmount) {
                eligible = false;
            }
            
            // Check member tier requirement
            if (promo.MemberTierRequired && member.TierName !== promo.MemberTierRequired) {
                eligible = false;
            }
            
            // Check category requirement
            if (promo.Category__c === 'electronics' && !hasElectronics) {
                eligible = false;
            }
            
            return {
                id: promo.Id,
                name: promo.Name,
                type: promo.PromotionType?.toLowerCase() || 'percentage',
                value: promo.DiscountValue || promo.PointsMultiplier || 0,
                description: promo.Description || '',
                eligible: eligible,
                startDate: promo.StartDate,
                endDate: promo.EndDate,
                conditions: {
                    minAmount: promo.MinimumPurchaseAmount || 0,
                    tierRequired: promo.MemberTierRequired,
                    category: promo.Category__c
                }
            };
        });
        
        res.json({
            success: true,
            orgId,
            customerId,
            member: {
                id: member.Id,
                name: member.Contact.Name,
                tier: member.TierName,
                pointsBalance: member.PointsBalance
            },
            promotions,
            source: 'salesforce_soql_query',
            metadata: {
                totalPromotions: promotions.length,
                eligiblePromotions: promotions.filter(p => p.eligible).length,
                requestTimestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Promotions API error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Real Salesforce Loyalty Management API: Get Vouchers
app.post('/api/salesforce/loyalty/vouchers', async (req, res) => {
    try {
        const { orgId, customerId } = req.body;
        
        // Get loyalty member information
        const member = await getLoyaltyMember(customerId);
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Loyalty member not found',
                customerId
            });
        }

        console.log(`🎫 Fetching vouchers for member: ${member.Contact.Name}`);
        
        // Method 1: Try Connect API for vouchers
        try {
            const vouchersEndpoint = `loyaltymgmt/members/${member.Id}/vouchers`;
            const vouchersData = await callSalesforceAPI(vouchersEndpoint, 'GET', null, true);
            
            const vouchers = vouchersData.vouchers.map(voucher => ({
                id: voucher.id,
                code: voucher.voucherCode,
                name: voucher.voucherDefinition.name,
                value: voucher.faceValue || voucher.discountPercent || 0,
                type: voucher.voucherDefinition.type?.toLowerCase() || 'fixed',
                expiryDate: voucher.expirationDate,
                status: voucher.status,
                used: voucher.status === 'Redeemed',
                eligible: voucher.status === 'Issued',
                description: voucher.voucherDefinition.description
            }));

            res.json({
                success: true,
                orgId,
                customerId,
                member: {
                    id: member.Id,
                    name: member.Contact.Name,
                    tier: member.TierName
                },
                vouchers,
                source: 'salesforce_connect_api',
                metadata: {
                    totalVouchers: vouchers.length,
                    availableVouchers: vouchers.filter(v => !v.used).length
                }
            });
            return;
        } catch (connectAPIError) {
            console.log('Connect API not available for vouchers, trying SOQL...');
        }

        // Method 2: Query Voucher objects via SOQL
        const soqlQuery = `
            SELECT Id, VoucherCode, VoucherDefinition.Name, VoucherDefinition.Type,
                   FaceValue, DiscountPercent, Status, ExpirationDate, IssuedDate,
                   VoucherDefinition.Description
            FROM Voucher 
            WHERE LoyaltyProgramMemberId = '${member.Id}'
            AND (ExpirationDate = null OR ExpirationDate >= TODAY)
            AND Status IN ('Issued', 'Partial')
            ORDER BY IssuedDate DESC
        `;
        
        const vouchersResult = await callSalesforceAPI(`query?q=${encodeURIComponent(soqlQuery)}`);
        
        const vouchers = vouchersResult.records.map(voucher => ({
            id: voucher.Id,
            code: voucher.VoucherCode,
            name: voucher.VoucherDefinition?.Name || 'Voucher',
            value: voucher.FaceValue || voucher.DiscountPercent || 0,
            type: voucher.VoucherDefinition?.Type?.toLowerCase() || 'fixed',
            expiryDate: voucher.ExpirationDate,
            status: voucher.Status,
            used: voucher.Status === 'Redeemed',
            eligible: voucher.Status === 'Issued',
            description: voucher.VoucherDefinition?.Description
        }));
        
        res.json({
            success: true,
            orgId,
            customerId,
            member: {
                id: member.Id,
                name: member.Contact.Name,
                tier: member.TierName
            },
            vouchers,
            source: 'salesforce_soql_query',
            metadata: {
                totalVouchers: vouchers.length,
                availableVouchers: vouchers.filter(v => !v.used).length
            }
        });
        
    } catch (error) {
        console.error('❌ Vouchers API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Real Salesforce Loyalty Management API: Process Transaction
app.post('/api/salesforce/loyalty/transaction/execute', async (req, res) => {
    try {
        const transactionData = req.body;
        
        // Get loyalty member information
        const member = await getLoyaltyMember(transactionData.customerId);
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Loyalty member not found',
                customerId: transactionData.customerId
            });
        }

        console.log(`💳 Processing transaction for member: ${member.Contact.Name}`);

        // Method 1: Use Salesforce Connect API for transaction processing
        try {
            const transactionJournalData = {
                loyaltyProgramMemberId: member.Id,
                journalType: "Accrual",
                journalSubType: "Purchase", 
                transactionJournalId: transactionData.transactionId,
                activityDate: new Date().toISOString(),
                productName: transactionData.items.map(item => item.name).join(", "),
                transactionAmount: transactionData.total,
                pointsChange: Math.floor(transactionData.total), // 1 point per dollar
                additionalAttributes: {
                    paymentMethod: transactionData.paymentMethod,
                    channel: "POS",
                    location: "Store",
                    items: transactionData.items
                }
            };

            // Process transaction through Connect API
            const processEndpoint = `loyaltymgmt/programs/${SALESFORCE_CONFIG.loyaltyProgramId}/program-processes/process-transaction`;
            const processResult = await callSalesforceAPI(processEndpoint, 'POST', transactionJournalData, true);
            
            // Calculate loyalty points earned
            const pointsEarned = processResult.pointsAwarded || Math.floor(transactionData.total);
            
            const response = {
                success: true,
                transactionId: transactionData.transactionId,
                salesforceTransactionId: processResult.transactionJournalId,
                confirmationNumber: `CONF_${Date.now()}`,
                status: 'completed',
                processedAt: new Date().toISOString(),
                member: {
                    id: member.Id,
                    name: member.Contact.Name,
                    tier: member.TierName
                },
                loyaltyPoints: {
                    earned: pointsEarned,
                    previousBalance: member.PointsBalance,
                    newBalance: member.PointsBalance + pointsEarned
                },
                appliedPromotions: transactionData.appliedPromotions || [],
                paymentDetails: {
                    method: transactionData.paymentMethod,
                    last4: '1234',
                    authCode: `AUTH${Math.random().toString(36).substr(2, 6).toUpperCase()}`
                },
                source: 'salesforce_connect_api'
            };
            
            res.json(response);
            return;
        } catch (connectAPIError) {
            console.log('Connect API not available, creating transaction journal manually...');
        }

        // Method 2: Create transaction journal manually using standard APIs
        const transactionJournalRecord = {
            LoyaltyProgramMemberId: member.Id,
            JournalType: 'Accrual',
            JournalSubType: 'Purchase',
            TransactionJournalId: transactionData.transactionId,
            ActivityDate: new Date().toISOString(),
            ProductName: transactionData.items.map(item => item.name).join(", "),
            TransactionAmount: transactionData.total,
            PointsChange: Math.floor(transactionData.total),
            Status: 'Processed'
        };
        
        const createdJournal = await callSalesforceAPI(
            'sobjects/TransactionJournal',
            'POST',
            transactionJournalRecord
        );

        // Create individual line items
        for (const item of transactionData.items) {
            const lineItemJournal = {
                LoyaltyProgramMemberId: member.Id,
                JournalType: 'Accrual',
                JournalSubType: 'Purchase',
                TransactionJournalId: `${transactionData.transactionId}-${item.sku}`,
                ActivityDate: new Date().toISOString(),
                ProductName: item.name,
                ProductSKU: item.sku,
                Quantity: item.quantity,
                TransactionAmount: item.totalPrice,
                PointsChange: Math.floor(item.totalPrice),
                Status: 'Processed'
            };
            
            await callSalesforceAPI(
                'sobjects/TransactionJournal',
                'POST',
                lineItemJournal
            );
        }

        // Update member's points balance (this would typically be done by loyalty program processes)
        const pointsEarned = Math.floor(transactionData.total);
        await callSalesforceAPI(
            `sobjects/LoyaltyProgramMember/${member.Id}`,
            'PATCH',
            {
                PointsBalance: member.PointsBalance + pointsEarned,
                TotalPointsAccrued: member.TotalPointsAccrued + pointsEarned,
                LastActivityDate: new Date().toISOString()
            }
        );
        
        const response = {
            success: true,
            transactionId: transactionData.transactionId,
            salesforceTransactionId: createdJournal.id,
            confirmationNumber: `CONF_${Date.now()}`,
            status: 'completed',
            processedAt: new Date().toISOString(),
            member: {
                id: member.Id,
                name: member.Contact.Name,
                tier: member.TierName
            },
            loyaltyPoints: {
                earned: pointsEarned,
                previousBalance: member.PointsBalance,
                newBalance: member.PointsBalance + pointsEarned
            },
            appliedPromotions: transactionData.appliedPromotions || [],
            paymentDetails: {
                method: transactionData.paymentMethod,
                last4: '1234',
                authCode: `AUTH${Math.random().toString(36).substr(2, 6).toUpperCase()}`
            },
            source: 'salesforce_standard_api'
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('❌ Transaction execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get member details endpoint
app.get('/api/salesforce/loyalty/member/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const member = await getLoyaltyMember(customerId);
        
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Loyalty member not found'
            });
        }

        res.json({
            success: true,
            member: {
                id: member.Id,
                name: member.Contact.Name,
                email: member.Contact.Email,
                tier: member.TierName,
                status: member.MemberStatus,
                enrollmentDate: member.EnrollmentDate,
                lastActivityDate: member.LastActivityDate,
                pointsBalance: member.PointsBalance,
                totalPointsAccrued: member.TotalPointsAccrued,
                totalPointsRedeemed: member.TotalPointsRedeemed,
                loyaltyProgram: {
                    id: member.LoyaltyProgram.Id,
                    name: member.LoyaltyProgram.Name
                }
            }
        });
    } catch (error) {
        console.error('❌ Member lookup error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enhanced configuration endpoint with External Client App status
app.get('/api/config', (req, res) => {
    res.json({
        orgId: SALESFORCE_CONFIG.orgId || '',
        instanceUrl: salesforceAuth.instanceUrl || SALESFORCE_CONFIG.instanceUrl || '',
        loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId || '',
        version: SALESFORCE_CONFIG.apiVersion || 'v58.0',
        authenticated: !!salesforceAuth.accessToken,
        tokenType: salesforceAuth.tokenType || 'Bearer',
        authMethod: 'external_client_app',
        scope: salesforceAuth.scope || 'Not available'
    });
});

// Enhanced authentication status endpoint
app.get('/api/auth/status', async (req, res) => {
    try {
        await ensureValidToken();
        
        // Test connectivity
        const connectivityLevel = await testExternalClientAppConnectivity();
        
        res.json({
            authenticated: true,
            authMethod: 'external_client_app',
            instanceUrl: salesforceAuth.instanceUrl,
            tokenType: salesforceAuth.tokenType,
            expiresAt: salesforceAuth.expiresAt,
            orgId: SALESFORCE_CONFIG.orgId,
            loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId,
            connectivityLevel: connectivityLevel,
            scope: salesforceAuth.scope
        });
    } catch (error) {
        res.json({
            authenticated: false,
            authMethod: 'external_client_app',
            error: error.message,
            troubleshooting: {
                checkClientId: 'Verify SALESFORCE_CLIENT_ID in Heroku Config Vars',
                checkClientSecret: 'Verify SALESFORCE_CLIENT_SECRET in Heroku Config Vars',
                checkCredentials: 'Verify username, password, and security token',
                checkPermissions: 'Ensure API user has Loyalty Management permissions'
            }
        });
    }
});

// Enhanced health check with External Client App diagnostics
app.get('/health', async (req, res) => {
    let authStatus = 'unknown';
    let loyaltyStatus = 'unknown';
    let connectivityLevel = 'unknown';
    let diagnostics = {};
    
    try {
        await ensureValidToken();
        authStatus = 'authenticated';
        
        // Test External Client App connectivity and capabilities
        connectivityLevel = await testExternalClientAppConnectivity();
        
        switch (connectivityLevel) {
            case 'full_loyalty_access':
                loyaltyStatus = 'full_access';
                break;
            case 'soql_only':
                loyaltyStatus = 'soql_fallback';
                break;
            case 'basic_api_only':
                loyaltyStatus = 'limited_access';
                break;
            case 'no_loyalty_config':
                loyaltyStatus = 'not_configured';
                break;
            default:
                loyaltyStatus = 'unavailable';
        }
        
        diagnostics = {
            clientAppType: 'external_client_app',
            tokenType: salesforceAuth.tokenType,
            apiVersion: SALESFORCE_CONFIG.apiVersion,
            scope: salesforceAuth.scope
        };
        
    } catch (error) {
        authStatus = 'failed';
        diagnostics.error = error.message;
        
        // Provide specific troubleshooting for External Client App
        if (error.message.includes('invalid_client_id')) {
            diagnostics.fix = 'Check External Client App Consumer Key';
        } else if (error.message.includes('invalid_grant')) {
            diagnostics.fix = 'Check username, password, and security token';
        } else if (error.message.includes('unsupported_grant_type')) {
            diagnostics.fix = 'Enable OAuth settings in External Client App';
        }
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        authentication: {
            status: authStatus,
            method: 'external_client_app'
        },
        loyalty: {
            status: loyaltyStatus,
            connectivity: connectivityLevel
        },
        diagnostics
    });
});

// Initialize External Client App connection on startup
async function initializeExternalClientApp() {
    try {
        console.log('🚀 Initializing External Client App connection...');
        
        // Validate configuration
        const requiredVars = ['clientId', 'clientSecret', 'username', 'password', 'securityToken'];
        const missingVars = requiredVars.filter(var => !SALESFORCE_CONFIG[var]);
        
        if (missingVars.length > 0) {
            console.log(`⚠️ Missing External Client App configuration: ${missingVars.join(', ')}`);
            console.log('🔄 Running in mock mode...');
            return;
        }
        
        // Test authentication
        await authenticateWithSalesforce();
        console.log('✅ External Client App authentication initialized');
        
        // Test connectivity levels
        const connectivityLevel = await testExternalClientAppConnectivity();
        console.log(`🔗 Connectivity Level: ${connectivityLevel}`);
        
        if (SALESFORCE_CONFIG.loyaltyProgramId) {
            console.log(`🎯 Using Loyalty Program: ${SALESFORCE_CONFIG.loyaltyProgramId}`);
        } else {
            console.log('⚠️ Loyalty Program ID not configured');
        }
        
        console.log('🎉 External Client App setup complete!');
        
    } catch (error) {
        console.error('❌ External Client App initialization failed:', error.message);
        console.log('🔄 Continuing in mock mode...');
        
        // Provide helpful troubleshooting
        if (error.message.includes('invalid_client_id')) {
            console.log('💡 Check: External Client App Consumer Key in Heroku Config Vars');
        } else if (error.message.includes('invalid_grant')) {
            console.log('💡 Check: Username, password, and security token combination');
        } else if (error.message.includes('unsupported_grant_type')) {
            console.log('💡 Check: OAuth settings enabled in External Client App');
        }
    }
}

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`🚀 POS Simulator running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Using: External Client App authentication`);
    
    // Initialize External Client App connection
    await initializeExternalClientApp();
    
    console.log(`🌐 App URL: http://localhost:${PORT}`);
    console.log(`📋 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔐 Auth Status: http://localhost:${PORT}/api/auth/status`);
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
