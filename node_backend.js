// server.js
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

// Heroku configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        orgId: process.env.SALESFORCE_ORG_ID || '',
        instanceUrl: process.env.SALESFORCE_INSTANCE_URL || '',
        version: process.env.SALESFORCE_API_VERSION || 'v58.0'
    });
});

// Mock Salesforce Loyalty API endpoints
app.post('/api/salesforce/loyalty/promotions', async (req, res) => {
    try {
        const { orgId, customerId, cartItems } = req.body;
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Mock promotion logic based on cart contents
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        const promotions = [
            {
                id: 'PROMO_001',
                name: '10% Off Electronics',
                type: 'percentage',
                value: 10,
                description: 'Get 10% off on all electronics items',
                eligible: cartItems.some(item => item.sku.includes('ELEC')),
                conditions: {
                    minAmount: 0,
                    categories: ['electronics']
                }
            },
            {
                id: 'VOUCHER_001',
                name: '$5 Off Purchase',
                type: 'fixed',
                value: 5,
                description: 'Get $5 off your total purchase',
                eligible: totalAmount >= 25,
                conditions: {
                    minAmount: 25
                }
            },
            {
                id: 'COUPON_001',
                name: 'Free Shipping',
                type: 'shipping',
                value: 0,
                description: 'Free shipping on orders over $50',
                eligible: totalAmount >= 50,
                conditions: {
                    minAmount: 50
                }
            },
            {
                id: 'LOYALTY_001',
                name: 'Loyalty Member 15% Off',
                type: 'percentage',
                value: 15,
                description: 'Exclusive discount for loyalty members',
                eligible: true,
                conditions: {
                    membershipTier: 'gold'
                }
            }
        ];
        
        res.json({
            success: true,
            orgId,
            customerId,
            promotions,
            metadata: {
                totalPromotions: promotions.length,
                eligiblePromotions: promotions.filter(p => p.eligible).length,
                requestTimestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Mock Salesforce Loyalty API for vouchers
app.post('/api/salesforce/loyalty/vouchers', async (req, res) => {
    try {
        const { orgId, customerId } = req.body;
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const vouchers = [
            {
                id: 'VOUCH_001',
                code: 'SAVE20NOW',
                name: '$20 Off Next Purchase',
                value: 20,
                type: 'fixed',
                expiryDate: '2025-12-31',
                usageLimit: 1,
                used: false,
                eligible: true
            },
            {
                id: 'VOUCH_002',
                code: 'BIRTHDAY25',
                name: '25% Birthday Discount',
                value: 25,
                type: 'percentage',
                expiryDate: '2025-08-15',
                usageLimit: 1,
                used: false,
                eligible: true
            }
        ];
        
        res.json({
            success: true,
            orgId,
            customerId,
            vouchers,
            metadata: {
                totalVouchers: vouchers.length,
                availableVouchers: vouchers.filter(v => !v.used).length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Mock Transaction Execution API
app.post('/api/salesforce/transaction/execute', async (req, res) => {
    try {
        const transactionData = req.body;
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Calculate loyalty points (1 point per dollar spent)
        const loyaltyPoints = Math.floor(transactionData.total);
        
        const response = {
            success: true,
            transactionId: transactionData.transactionId,
            confirmationNumber: `CONF_${Date.now()}`,
            status: 'completed',
            processedAt: new Date().toISOString(),
            loyaltyPoints: {
                earned: loyaltyPoints,
                previousBalance: 1250,
                newBalance: 1250 + loyaltyPoints
            },
            appliedPromotions: transactionData.appliedPromotions || [],
            paymentDetails: {
                method: transactionData.paymentMethod,
                last4: '1234',
                authCode: `AUTH${Math.random().toString(36).substr(2, 6).toUpperCase()}`
            },
            receipt: {
                items: transactionData.items,
                subtotal: transactionData.subtotal,
                tax: transactionData.tax,
                total: transactionData.total,
                savedAmount: transactionData.appliedPromotions ? 
                    transactionData.items.reduce((sum, item) => sum + (item.totalPrice * 0.1), 0) : 0
            }
        };
        
        res.json(response);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`POS Simulator running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Salesforce Org ID: ${process.env.SALESFORCE_ORG_ID || 'Not configured'}`);
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