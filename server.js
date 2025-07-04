// Enhanced server.js with Real Salesforce Loyalty Management APIs
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

// Salesforce Authentication Configuration
const SALESFORCE_CONFIG = {
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    username: process.env.SALESFORCE_USERNAME,
    password: process.env.SALESFORCE_PASSWORD,
    securityToken: process.env.SALESFORCE_SECURITY_TOKEN,
    instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://login.salesforce.com',
    apiVersion: process.env.SALESFORCE_API_VERSION || 'v61.0',
    loyaltyProgramId: process.env.SALESFORCE_LOYALTY_PROGRAM_ID
};

// Store access token in memory (use Redis/database in production)
let salesforceAuth = {
    accessToken: null,
    instanceUrl: null,
    expiresAt: null
};

// Salesforce Authentication Functions
async function authenticateWithSalesforce() {
    try {
        console.log('🔐 Authenticating with Salesforce...');
        
        const authUrl = `${SALESFORCE_CONFIG.instanceUrl}/services/oauth2/token`;
        const params = new URLSearchParams({
            grant_type: 'password',
            client_id: SALESFORCE_CONFIG.clientId,
            client_secret: SALESFORCE_CONFIG.clientSecret,
            username: SALESFORCE_CONFIG.username,
            password: SALESFORCE_CONFIG.password + SALESFORCE_CONFIG.securityToken
        });

        const response = await axios.post(authUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        salesforceAuth = {
            accessToken: response.data.access_token,
            instanceUrl: response.data.instance_url,
            expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
        };

        console.log('✅ Salesforce authentication successful');
        return salesforceAuth;
    } catch (error) {
        console.error('❌ Salesforce authentication failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Salesforce');
    }
}

// Check if token is valid and refresh if needed
async function ensureValidToken() {
    if (!salesforceAuth.accessToken || Date.now() >= salesforceAuth.expiresAt) {
        await authenticateWithSalesforce();
    }
    return salesforceAuth;
}

// Generic Salesforce API call function
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
                'Authorization': `Bearer ${salesforceAuth.accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error('Salesforce API call failed:', error.response?.data || error.message);
        
        // If authentication error, try to re-authenticate once
        if (error.response?.status === 401) {
            console.log('🔄 Token expired, re-authenticating...');
            await authenticateWithSalesforce();
            
            // Retry the call with new token
            const baseUrl = isConnectAPI 
                ? `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}/connect`
                : `${salesforceAuth.instanceUrl}/services/data/${SALESFORCE_CONFIG.apiVersion}`;
            
            const retryConfig = {
                method,
                url: `${baseUrl}/${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${salesforceAuth.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };
            
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                retryConfig.data = data;
            }
            
            const retryResponse = await axios(retryConfig);
            return retryResponse.data;
        }
        
        throw error;
    }
}

// Get Loyalty Member Information
async function getLoyaltyMember(customerId) {
    try {
        // Query loyalty program member
        const soqlQuery = `
            SELECT Id, Contact.Id, Contact.Name, Contact.Email, LoyaltyProgram.Id, 
                   LoyaltyProgram.Name, MemberStatus, EnrollmentDate, LastActivityDate,
                   TotalPointsAccrued, TotalPointsRedeemed, TotalPointsExpired,
                   PointsBalance, TierName
            FROM LoyaltyProgramMember 
            WHERE Contact.External_ID__c = '${customerId}' 
            AND LoyaltyProgram.Id = '${SALESFORCE_CONFIG.loyaltyProgramId}'
            LIMIT 1
        `;
        
        const result = await callSalesforceAPI(`query?q=${encodeURIComponent(soqlQuery)}`);
        return result.records.length > 0 ? result.records[0] : null;
    } catch (error) {
        console.error('Error fetching loyalty member:', error);
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

// Enhanced configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        orgId: process.env.SALESFORCE_ORG_ID || '',
        instanceUrl: salesforceAuth.instanceUrl || process.env.SALESFORCE_INSTANCE_URL || '',
        loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId || '',
        version: process.env.SALESFORCE_API_VERSION || 'v58.0',
        authenticated: !!salesforceAuth.accessToken
    });
});

// Authentication status endpoint
app.get('/api/auth/status', async (req, res) => {
    try {
        await ensureValidToken();
        res.json({
            authenticated: true,
            instanceUrl: salesforceAuth.instanceUrl,
            expiresAt: salesforceAuth.expiresAt,
            orgId: process.env.SALESFORCE_ORG_ID,
            loyaltyProgramId: SALESFORCE_CONFIG.loyaltyProgramId
        });
    } catch (error) {
        res.json({
            authenticated: false,
            error: error.message
        });
    }
});

// Health check with authentication status
app.get('/health', async (req, res) => {
    let authStatus = 'unknown';
    let loyaltyStatus = 'unknown';
    
    try {
        await ensureValidToken();
        authStatus = 'authenticated';
        
        // Test loyalty API connectivity
        if (SALESFORCE_CONFIG.loyaltyProgramId) {
            try {
                await callSalesforceAPI(`sobjects/LoyaltyProgram/${SALESFORCE_CONFIG.loyaltyProgramId}`);
                loyaltyStatus = 'connected';
            } catch (loyaltyError) {
                loyaltyStatus = 'program_not_found';
            }
        } else {
            loyaltyStatus = 'program_not_configured';
        }
    } catch (error) {
        authStatus = 'failed';
    }
    
    res.json({
        status: 'healthy',
        salesforce: authStatus,
        loyalty: loyaltyStatus,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Initialize Salesforce connection on startup
async function initializeSalesforce() {
    try {
        if (SALESFORCE_CONFIG.clientId && SALESFORCE_CONFIG.clientSecret) {
            await authenticateWithSalesforce();
            console.log('✅ Salesforce authentication initialized');
            
            if (SALESFORCE_CONFIG.loyaltyProgramId) {
                console.log(`🎯 Using Loyalty Program: ${SALESFORCE_CONFIG.loyaltyProgramId}`);
            } else {
                console.log('⚠️ Loyalty Program ID not configured');
            }
        } else {
            console.log('⚠️ Salesforce credentials not configured - running in mock mode');
        }
    } catch (error) {
        console.error('❌ Salesforce initialization failed:', error.message);
        console.log('🔄 Continuing in mock mode...');
    }
}

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`🚀 POS Simulator running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize Salesforce connection
    await initializeSalesforce();
    
    console.log(`🌐 App URL: http://localhost:${PORT}`);
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
