const crypto = require("crypto");

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || "";
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY || "";
    this.baseUrl = "https://api.paystack.co";
  }

  getSecretKey() {
    return this.secretKey || process.env.PAYSTACK_SECRET_KEY || "";
  }

  /**
   * Initialize a transaction with Paystack
   * @param {Object} params - { email, amount, amountInKobo, reference, callbackUrl, metadata }
   * @returns {Promise<Object>} { authorizationUrl, authorization_url, accessCode, access_code, reference, data, raw }
   */
  async initializeTransaction({ email, amount, amountInKobo, reference, callbackUrl, metadata = {} }) {
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      throw new Error("Paystack secret key is not configured");
    }

    const rawAmount = amountInKobo !== undefined && amountInKobo !== null ? amountInKobo : amount;
    const resolvedAmount = Math.round(Number(rawAmount));

    if (!resolvedAmount || isNaN(resolvedAmount) || resolvedAmount <= 0) {
      throw new Error(`Invalid payment amount: ${rawAmount}. Amount must be a positive number in kobo.`);
    }

    const payload = {
      email,
      amount: resolvedAmount, // integer in kobo
      reference,
      callback_url: callbackUrl,
      metadata,
    };

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      const errMsg = data.message || "Failed to initialize payment with Paystack";
      throw new Error(errMsg);
    }

    const resData = data.data || {};
    return {
      authorizationUrl: resData.authorization_url,
      authorization_url: resData.authorization_url,
      accessCode: resData.access_code,
      access_code: resData.access_code,
      reference: resData.reference || reference,
      data: resData,
      raw: resData,
    };
  }

  /**
   * Independently verify transaction status with Paystack
   * @param {string} reference
   * @returns {Promise<Object>} Verification details
   */
  async verifyTransaction(reference) {
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      throw new Error("Paystack secret key is not configured");
    }

    const cleanRef = encodeURIComponent(reference.trim());
    const response = await fetch(`${this.baseUrl}/transaction/verify/${cleanRef}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      const errMsg = data.message || "Failed to verify transaction with Paystack";
      throw new Error(errMsg);
    }

    const resData = data.data || {};
    return {
      status: resData.status, // "success", "failed", "abandoned"
      reference: resData.reference,
      amount: resData.amount, // in kobo
      currency: resData.currency,
      channel: resData.channel,
      paidAt: resData.paid_at ? new Date(resData.paid_at) : new Date(),
      paid_at: resData.paid_at,
      customer: resData.customer,
      gatewayResponse: resData.gateway_response,
      raw: resData,
      data: resData,
    };
  }

  /**
   * Verify Paystack Webhook Signature using raw body HMAC SHA512
   * @param {Buffer|string} rawBody
   * @param {string} signatureHeader
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signatureHeader) {
    const secretKey = this.getSecretKey();
    if (!secretKey || !signatureHeader || !rawBody) {
      return false;
    }

    try {
      const hash = crypto
        .createHmac("sha512", secretKey)
        .update(rawBody)
        .digest("hex");

      return hash === signatureHeader;
    } catch (e) {
      console.error("Error computing webhook signature:", e);
      return false;
    }
  }
}

module.exports = new PaystackService();
