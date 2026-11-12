import express from 'express';
import dotenv from 'dotenv';
import checkoutNodeJSSDK from '@paypal/checkout-server-sdk';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the frontend interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// PayPal Sandbox Setup
function client() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const environment = new checkoutNodeJSSDK.core.SandboxEnvironment(clientId, clientSecret);
    return new checkoutNodeJSSDK.core.PayPalHttpClient(environment);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Route 1: AI Credit Simulation & Risk Analysis ---
app.post('/api/simulate-credit', async (req, res) => {
    try {
        const { loanAmount, months, monthlyIncome, purpose } = req.body;

        const systemPrompt = `
        You are CreditPAY, an autonomous AI credit underwriting and simulation agent.
        Analyze the user's loan request:
        - Requested Amount: $${loanAmount}
        - Term: ${months} months
        - Monthly Income: $${monthlyIncome}
        - Purpose: ${purpose}

        Calculate a fair monthly interest rate, fixed monthly installment, total repayment amount, and determine if the credit is APPROVED or CONDITIONALLY_APPROVED.
        Respond strictly in JSON format with these exact keys:
        {
          "status": "APPROVED",
          "riskLevel": "Low | Medium | High",
          "interestRateMonthly": "2.1%",
          "monthlyInstallment": "0.00",
          "totalRepayment": "0.00",
          "aiAdvice": "Brief financial explanation for the user in English."
        }`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const simulation = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, simulation });

    } catch (error) {
        console.error("Simulation Error:", error);
        res.status(500).json({ error: "Failed to run AI credit simulation." });
    }
});

// --- Route 2: PayPal Orders API Integration ---
app.post('/api/create-credit-order', async (req, res) => {
    const { amount, description } = req.body;

    const request = new checkoutNodeJSSDK.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
            amount: {
                currency_code: "USD",
                value: amount
            },
            description: description || "CreditPAY - First Loan Installment / Asset Reservation"
        }]
    });

    try {
        const response = await client().execute(request);
        const approvalUrl = response.result.links.find(link => link.rel === 'approve').href;
        res.json({
            orderID: response.result.id,
            approvalUrl: approvalUrl
        });
    } catch (err) {
        console.error("PayPal Error:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`CreditPAY AI Server running on port ${PORT}`);
});
