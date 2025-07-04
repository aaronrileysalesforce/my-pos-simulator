# POS Cart Transaction Simulator

A modern Point of Sale cart transaction simulator that integrates with **Salesforce Loyalty Management APIs** using **External Client Apps**. Features real-time promotions, voucher management, and transaction processing with a beautiful glassmorphism UI.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## 🎯 Features

### **Frontend**
- 🛒 **Real-time Cart Management** - Add, remove, and modify cart items
- 🎨 **Modern Glassmorphism UI** - Beautiful, responsive design
- 📱 **Mobile Responsive** - Works on all devices
- 🔄 **Live API Visualization** - See real-time API calls and responses
- ⌨️ **Keyboard Shortcuts** - Power user features

### **Salesforce Integration**
- 🔐 **External Client App Authentication** - Modern OAuth 2.0 with proper security
- 🎁 **Real Promotions API** - Fetch live promotions from Salesforce
- 🎫 **Voucher Management** - Real voucher redemption and tracking
- 💳 **Transaction Processing** - Complete transaction execution with loyalty points
- 🏆 **Loyalty Member Integration** - Real member data and tier management
- 📊 **Connect API + SOQL Fallback** - Robust API integration with fallbacks

### **Production Ready**
- ⚡ **Auto-scaling on Heroku** - Handle traffic spikes
- 🔄 **Automatic Token Refresh** - Seamless authentication
- 📈 **Health Monitoring** - Built-in diagnostics and monitoring
- 🛡️ **Security Best Practices** - Secure credential management

## 🚀 Quick Deploy

### One-Click Heroku Deployment

1. **Click the Deploy Button Above**
2. **Fill in Required Environment Variables:**
   - `SALESFORCE_CLIENT_ID` - Your External Client App Consumer Key
   - `SALESFORCE_CLIENT_SECRET` - Your External Client App Consumer Secret  
   - `SALESFORCE_USERNAME` - API user with Loyalty Management permissions
   - `SALESFORCE_PASSWORD` - API user password
   - `SALESFORCE_SECURITY_TOKEN` - API user security token
   - `SALESFORCE_LOYALTY_PROGRAM_ID` - Your Loyalty Program ID (optional)

3. **Deploy and Use!**

## 🛠️ Prerequisites

### Salesforce Setup Required

1. **Salesforce Org with Loyalty Management**
   - Loyalty Management must be enabled
   - At least one Loyalty Program created

2. **External Client App (Connected App)**
   - OAuth enabled with proper scopes
   - Consumer Key and Consumer Secret

3. **API User with Permissions**
   - "Loyalty Management User" permission set
   - "API Enabled" profile/permission
   - Security token generated

## 📋 Detailed Setup Instructions

### 1. Create Salesforce External Client App

```bash
Setup → Apps → App Manager → New Connected App

Basic Information:
- Name: POS Loyalty Simulator
- API Name: POS_Loyalty_Simulator
- Contact Email: your-email@company.com

OAuth Settings:
✅ Enable OAuth Settings
✅ Callback URL: https://your-app.herokuapp.com/oauth/callback
✅ Selected Scopes:
  - Access the identity URL service (id, profile, email, address, phone)
  - Manage user data via APIs (api)
  - Access Connect REST API resources (chatter_api)
  - Perform requests at any time (refresh_token, offline_access)
  - Access unique user identifiers (openid)
```

### 2. Create API User

```bash
Setup → Users → New User

Profile: System Administrator (or custom with API access)
Username: api.loyalty@yourcompany.com
Assign Permission Sets:
- API Enabled
- Loyalty Management User
```

### 3. Get Required IDs

```bash
# Organization ID
Setup → Company Information → Salesforce.com Organization ID

# Loyalty Program ID  
App Launcher → Loyalty Management → Programs → [Your Program] → Copy ID

# External Client App Credentials
Setup → Apps → App Manager → [Your App] → View → Consumer Key & Secret
```

## 🔧 Local Development

### 1. Clone and Install
```bash
git clone https://github.com/yourusername/pos-cart-simulator.git
cd pos-cart-simulator
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Salesforce credentials
```

### 3. Run Locally
```bash
npm start
# Visit http://localhost:3000
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with Salesforce connectivity |
| `/api/auth/status` | GET | Authentication status and diagnostics |
| `/api/config` | GET | Server configuration |
| `/api/salesforce/loyalty/promotions` | POST | Get available promotions |
| `/api/salesforce/loyalty/vouchers` | POST | Get member vouchers |
| `/api/salesforce/loyalty/transaction/execute` | POST | Process transaction |
| `/api/salesforce/loyalty/member/:id` | GET | Get member details |

## 🧪 Testing the Integration

### 1. Check Health Status
```bash
curl https://your-app.herokuapp.com/health

# Expected Response:
{
  "status": "healthy",
  "authentication": {
    "status": "authenticated",
    "method": "external_client_app"
  },
  "loyalty": {
    "status": "full_access",
    "connectivity": "full_loyalty_access"
  }
}
```

### 2. Test Promotions API
```bash
curl -X POST https://your-app.herokuapp.com/api/salesforce/loyalty/promotions \
  -H "Content-Type: application/json" \
  -d '{"customerId":"CUST_001","cartItems":[{"sku":"TEST","price":100,"quantity":1}]}'
```

### 3. Process a Transaction
```bash
curl -X POST https://your-app.herokuapp.com/api/salesforce/loyalty/transaction/execute \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"TXN_123","customerId":"CUST_001","total":150.00,"items":[...]}'
```

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SALESFORCE_CLIENT_ID` | ✅ | External Client App Consumer Key |
| `SALESFORCE_CLIENT_SECRET` | ✅ | External Client App Consumer Secret |
| `SALESFORCE_USERNAME` | ✅ | API user username |
| `SALESFORCE_PASSWORD` | ✅ | API user password |
| `SALESFORCE_SECURITY_TOKEN` | ✅ | API user security token |
| `SALESFORCE_INSTANCE_URL` | ⚠️ | Login URL (default: https://login.salesforce.com) |
| `SALESFORCE_API_VERSION` | ⚠️ | API version (default: v58.0) |
| `SALESFORCE_LOYALTY_PROGRAM_ID` | ⚠️ | Loyalty Program ID |
| `SALESFORCE_ORG_ID` | ⚠️ | Organization ID |
| `NODE_ENV` | ⚠️ | Environment (default: production) |

## 🚨 Troubleshooting

### Common Issues

#### "invalid_client_id"
```bash
Problem: External Client App Consumer Key not recognized
Fix: Verify SALESFORCE_CLIENT_ID matches Consumer Key exactly
```

#### "invalid_grant"  
```bash
Problem: Username/password/token combination incorrect
Fix: Ensure password + security token are concatenated correctly
```

#### "insufficient_access_on_cross_reference_entity"
```bash
Problem: API user lacks Loyalty Management permissions
Fix: Add "Loyalty Management User" permission set to API user
```

#### Connection Timeout
```bash
Problem: Network connectivity issues
Fix: Check Heroku Config Vars and Salesforce instance URL
```

### Debug Steps

1. **Check Application Logs**
   ```bash
   heroku logs --tail
   ```

2. **Verify Configuration**
   ```bash
   heroku config
   ```

3. **Test Health Endpoint**
   ```bash
   curl https://your-app.herokuapp.com/health
   ```

4. **Check Salesforce Login History**
   ```
   Setup → Users → Login History
   ```

## 📊 Architecture

```
Frontend (React-like vanilla JS)
    ↓
Express.js API Server
    ↓
External Client App OAuth 2.0
    ↓
Salesforce Loyalty Management APIs
    ├── Connect API (Primary)
    └── SOQL Queries (Fallback)
```

## 🏗️ Built With

- **Backend**: Node.js, Express.js, Axios
- **Frontend**: Vanilla JavaScript, CSS3 (Glassmorphism)
- **Authentication**: OAuth 2.0 (External Client App)
- **Deployment**: Heroku
- **APIs**: Salesforce REST API, Connect API, SOQL

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/pos-cart-simulator/issues)
- **Documentation**: [Salesforce Loyalty Management Docs](https://developer.salesforce.com/docs/atlas.en-us.loyalty.meta/loyalty/)
- **Heroku**: [Heroku Support](https://help.heroku.com/)

## 🎉 Acknowledgments

- Salesforce for the comprehensive Loyalty Management APIs
- Heroku for the seamless deployment platform
- The open-source community for the amazing tools and libraries

---

**⭐ Star this repository if it helped you build an awesome POS integration!**
