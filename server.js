import express from 'express';
import dotenv from 'dotenv';
import checkoutNodeJSSDK from '@paypal/checkout-server-sdk';
import OpenAI from 'openai';

dotenv.config();
const app = express();
app.use(express.json());


function environment() {
    let clientId = process.env.PAYPAL_CLIENT_ID;
    let clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    return new checkoutNodeJSSDK.core.SandboxEnvironment(clientId, clientSecret);
}

function client() {
    return new checkoutNodeJSSDK.core.PayPalHttpClient(environment());
}

// --- 2. OpenAI AI Setup ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Route 1: AI Agent Action (Decides when to create an order) ---
app.post('/api/ai-agent-action', async (req, res) => {
    try {
        const { prompt } = req.body;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                  role: "system", 
                  content: "You are an e-commerce AI agent integrated with PayPal. Respond in JSON format indicating if the user's intent requires creating a charge, specifying the 'amount' and 'description'." 
                },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const aiDecision = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, aiDecision });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "Failed to process AI action." });
    }
});


app.post('/api/create-paypal-order', async (req, res) => {
    const { amount, description } = req.body;

    let request = new checkoutNodeJSSDK.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
            amount: {
                currency_code: "USD",
                value: amount
            },
            description: description || "AI Agent Generated Product"
        }]
    });

    try {
        let paypalClient = client();
        let response = await paypalClient.execute(request);
        
        const approvalUrl = response.result.links.find(link => link.rel === 'approve').href;
        
        res.json({
            orderID: response.result.id,
            approvalUrl: approvalUrl
        });
    } catch (err) {
        console.error("PayPal Order Error:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
