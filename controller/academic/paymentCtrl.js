const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const mongoose = require("mongoose");
const StudentInvoice = require("../../models/Academy/StudentInvoice");
const PaymentTransaction = require("../../models/Academy/PaymentTransaction");
const Receipt = require("../../models/Academy/Receipt");
const Student = require("../../models/Academy/Student");
const Parent = require("../../models/Staff/Parent");
const paystackService = require("../../services/payment/paystackService");

// Helper function to apply a verified successful transaction to an invoice idempotently
const applyTransactionToInvoice = async (reference, gatewayData = {}) => {
  // Atomic conditional update: only update if isAppliedToInvoice is false
  const updatedTx = await PaymentTransaction.findOneAndUpdate(
    { reference, isAppliedToInvoice: false },
    {
      $set: {
        status: "success",
        gatewayStatus: gatewayData.status || "success",
        gatewayReference: gatewayData.reference || reference,
        gatewayResponse: gatewayData,
        channel: gatewayData.channel || "card",
        paidAt: gatewayData.paid_at ? new Date(gatewayData.paid_at) : new Date(),
        isAppliedToInvoice: true,
      },
    },
    { new: true }
  );

  // If null, it was either not found or already applied!
  if (!updatedTx) {
    const existingTx = await PaymentTransaction.findOne({ reference })
      .populate("invoice")
      .populate("receipt")
      .populate("student", "name studentId StudentId currentClassLevel email");

    if (!existingTx) {
      throw new Error(`Transaction with reference ${reference} not found`);
    }

    let receipt = existingTx.receipt;
    if (!receipt) {
      // Self-heal: receipt was missed if previous attempt threw before receipt creation
      const invoice = await StudentInvoice.findById(existingTx.invoice);
      if (invoice) {
        // Ensure invoice is credited if it wasn't credited before the crash
        const alreadyInHistory = invoice.paymentHistory?.some(
          (p) => p.reference === existingTx.reference || p.transaction?.toString() === existingTx._id.toString()
        );
        const invoiceTotal = invoice.totalAmountDue || invoice.totalAmount || invoice.subtotal || 0;
        if (!alreadyInHistory) {
          invoice.amountPaid = (invoice.amountPaid || 0) + existingTx.amount;
          const remaining = Math.max(0, invoiceTotal - invoice.amountPaid);
          invoice.balanceDue = remaining;
          invoice.balanceAmount = remaining;
          invoice.totalAmountDue = invoiceTotal;
          invoice.totalAmount = invoiceTotal;

          if (remaining === 0) {
            invoice.status = "paid";
            invoice.paidAt = existingTx.paidAt || new Date();
          } else if (invoice.amountPaid > 0) {
            invoice.status = "partially_paid";
          }

          if (!Array.isArray(invoice.paymentHistory)) {
            invoice.paymentHistory = [];
          }
          invoice.paymentHistory.push({
            transaction: existingTx._id,
            reference: existingTx.reference,
            amount: existingTx.amount,
            paidAt: existingTx.paidAt || new Date(),
            channel: existingTx.channel || "card",
          });
          await invoice.save();
        }
        receipt = await Receipt.create({
          receiptNumber,
          invoice: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          student: invoice.student,
          payer: {
            user: existingTx.payer?.user || existingTx.payerId,
            role: existingTx.payer?.role || existingTx.payerType || "student",
            name: existingTx.payer?.name || existingTx.payerName || "Student / Guardian",
            email: existingTx.payer?.email || existingTx.payerEmail || "payment@school.com",
            payerId: existingTx.payerId || existingTx.payer?.user,
            payerType: existingTx.payerType || existingTx.payer?.role || "student",
          },
          payerType: existingTx.payerType || existingTx.payer?.role || "student",
          payerId: existingTx.payerId || existingTx.payer?.user,
          payerName: existingTx.payerName || existingTx.payer?.name || "Student / Guardian",
          payerEmail: existingTx.payerEmail || existingTx.payer?.email || "payment@school.com",
          transaction: existingTx._id,
          amountPaid: existingTx.amount,
          currency: existingTx.currency || "NGN",
          channel: existingTx.channel || "card",
          paymentMethod: existingTx.channel || "paystack",
          paymentReference: existingTx.reference,
          gatewayReference: existingTx.gatewayReference || "",
          paidAt: existingTx.paidAt || new Date(),
          paymentDate: existingTx.paidAt || new Date(),
          invoiceTotal,
          invoiceTotalAmount: invoiceTotal,
          previousAmountPaid: Math.max(0, (invoice.amountPaid || existingTx.amount) - existingTx.amount),
          totalAmountPaidToDate: invoice.amountPaid || existingTx.amount,
          remainingBalance: invoice.balanceDue !== undefined ? invoice.balanceDue : (invoice.balanceAmount || 0),
          academicYear: invoice.academicYear?._id || invoice.academicYear,
          academicTerm: invoice.academicTerm?._id || invoice.academicTerm,
          classLevel: invoice.classLevel,
          itemsSnapshot: invoice.itemsSnapshot?.length ? invoice.itemsSnapshot : (invoice.items || []),
        });

        existingTx.receipt = receipt._id;
        await existingTx.save();
      }
    }

    return {
      transaction: existingTx,
      invoice: existingTx.invoice,
      receipt,
      alreadyApplied: true,
    };
  }

  // Update invoice balance and status
  const invoice = await StudentInvoice.findById(updatedTx.invoice)
    .populate("academicYear", "name")
    .populate("academicTerm", "name");

  if (!invoice) {
    throw new Error(`Invoice associated with transaction ${reference} not found`);
  }

  const invoiceTotal = invoice.totalAmountDue || invoice.totalAmount || invoice.subtotal || 0;
  invoice.amountPaid = (invoice.amountPaid || 0) + updatedTx.amount;
  const remaining = Math.max(0, invoiceTotal - invoice.amountPaid);
  invoice.balanceDue = remaining;
  invoice.balanceAmount = remaining;
  invoice.totalAmountDue = invoiceTotal;
  invoice.totalAmount = invoiceTotal;

  if (remaining === 0) {
    invoice.status = "paid";
    invoice.paidAt = updatedTx.paidAt || new Date();
  } else if (invoice.amountPaid > 0) {
    invoice.status = "partially_paid";
  }

  if (!Array.isArray(invoice.paymentHistory)) {
    invoice.paymentHistory = [];
  }

  invoice.paymentHistory.push({
    transaction: updatedTx._id,
    reference: updatedTx.reference,
    amount: updatedTx.amount,
    paidAt: updatedTx.paidAt || new Date(),
    channel: updatedTx.channel || "card",
  });

  await invoice.save();

  // Create immutable Receipt
  const receiptYear = new Date().getFullYear();
  const receiptRandom = crypto.randomBytes(3).toString("hex").toUpperCase();
  const receiptTime = Date.now().toString().slice(-4);
  const receiptNumber = `REC-${receiptYear}-${receiptRandom}${receiptTime}`;

  const receipt = await Receipt.create({
    receiptNumber,
    invoice: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    student: invoice.student,
    payer: {
      user: updatedTx.payer?.user || updatedTx.payerId,
      role: updatedTx.payer?.role || updatedTx.payerType || "student",
      name: updatedTx.payer?.name || updatedTx.payerName || "Student / Guardian",
      email: updatedTx.payer?.email || updatedTx.payerEmail || "payment@school.com",
      payerId: updatedTx.payerId || updatedTx.payer?.user,
      payerType: updatedTx.payerType || updatedTx.payer?.role || "student",
    },
    payerType: updatedTx.payerType || updatedTx.payer?.role || "student",
    payerId: updatedTx.payerId || updatedTx.payer?.user,
    payerName: updatedTx.payerName || updatedTx.payer?.name || "Student / Guardian",
    payerEmail: updatedTx.payerEmail || updatedTx.payer?.email || "payment@school.com",
    transaction: updatedTx._id,
    amountPaid: updatedTx.amount,
    currency: updatedTx.currency || "NGN",
    channel: updatedTx.channel || "card",
    paymentMethod: updatedTx.channel || "paystack",
    paymentReference: updatedTx.reference,
    gatewayReference: updatedTx.gatewayReference || "",
    paidAt: updatedTx.paidAt || new Date(),
    paymentDate: updatedTx.paidAt || new Date(),
    invoiceTotal: invoiceTotal,
    invoiceTotalAmount: invoiceTotal,
    previousAmountPaid: Math.max(0, invoice.amountPaid - updatedTx.amount),
    totalAmountPaidToDate: invoice.amountPaid,
    remainingBalance: remaining,
    academicYear: invoice.academicYear?._id || invoice.academicYear,
    academicTerm: invoice.academicTerm?._id || invoice.academicTerm,
    classLevel: invoice.classLevel,
    itemsSnapshot: invoice.itemsSnapshot?.length ? invoice.itemsSnapshot : (invoice.items || []),
  });

  updatedTx.receipt = receipt._id;
  await updatedTx.save();

  return {
    transaction: updatedTx,
    invoice,
    receipt,
    alreadyApplied: false,
  };
};

//@desc Initialize Payment with Paystack
//@route POST /api/v1/finance/payments/initialize
//@access Private (Admin, Student, Parent)
exports.initializePaymentCtrl = AsyncHandler(async (req, res) => {
  const { invoiceId, amount, isKobo = false, callbackUrl } = req.body;

  if (!invoiceId) {
    res.status(400);
    throw new Error("Invoice ID is required");
  }

  const invoice = await StudentInvoice.findById(invoiceId)
    .populate("student", "name email studentId StudentId currentClassLevel")
    .populate("academicYear", "name")
    .populate("academicTerm", "name");

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  // Authorization check
  const user = req.userAuth;
  if (user.role === "student") {
    if (invoice.student._id.toString() !== user._id.toString()) {
      res.status(403);
      throw new Error("Access denied: You can only pay your own invoice");
    }
  } else if (user.role === "parent") {
    const parentDoc = await Parent.findById(user._id);
    const hasChild = parentDoc?.children.some(
      (cid) => cid.toString() === invoice.student._id.toString()
    );
    if (!hasChild) {
      res.status(403);
      throw new Error("Access denied: You can only pay invoices for your linked children");
    }
  } else if (user.role !== "admin") {
    res.status(403);
    throw new Error("Access denied: Unauthorized role for payment initialization");
  }

  const outstandingBalance =
    invoice.balanceDue !== undefined
      ? invoice.balanceDue
      : invoice.balanceAmount !== undefined
      ? invoice.balanceAmount
      : (invoice.totalAmountDue || invoice.totalAmount || 0);

  if (invoice.status === "paid" || outstandingBalance <= 0) {
    res.status(400);
    throw new Error("This invoice is already fully paid");
  }

  // Calculate payment amount in kobo
  let paymentKobo = outstandingBalance;
  if (amount !== undefined && amount !== null && amount !== "") {
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400);
      throw new Error("Invalid payment amount specified");
    }
    paymentKobo = isKobo ? Math.round(parsedAmount) : Math.round(parsedAmount * 100);
  }

  // Strictly prevent overpayments
  if (paymentKobo > outstandingBalance) {
    const maxNaira = (outstandingBalance / 100).toLocaleString();
    res.status(400);
    throw new Error(
      `Payment amount exceeds outstanding balance. Maximum payable is ₦${maxNaira}`
    );
  }

  // Minimum payment: 100 kobo (1 Naira)
  if (paymentKobo < 100) {
    res.status(400);
    throw new Error("Minimum payment amount is ₦1.00");
  }

  // Generate unique payment reference
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  const timePart = Date.now().toString().slice(-6);
  const reference = `SMS-PAY-${timePart}-${randomPart}`;

  // Determine payer details
  const payerEmail = user.email || invoice.student?.email || "payment@school.com";
  const payerName = user.name || "Student / Guardian";
  const payerRole = user.role || "student";
  const payerId = user._id;

  // Construct callback url with intelligent caller-origin detection
  let requestOrigin = req.headers.origin;
  if (!requestOrigin && req.headers.referer) {
    try {
      requestOrigin = new URL(req.headers.referer).origin;
    } catch (e) {}
  }
  const defaultFrontendUrl =
    requestOrigin ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173";
  const finalCallbackUrl =
    callbackUrl ||
    `${defaultFrontendUrl.replace(/\/$/, "")}/finance/payment-verify?reference=${reference}`;

  // Create pending payment transaction
  const transaction = await PaymentTransaction.create({
    reference,
    invoice: invoice._id,
    student: invoice.student._id,
    payer: {
      user: payerId,
      role: payerRole,
      name: payerName,
      email: payerEmail,
      payerId,
      payerType: payerRole,
    },
    payerType: payerRole,
    payerId,
    payerName,
    payerEmail,
    amount: paymentKobo,
    currency: "NGN",
    gateway: "paystack",
    status: "pending",
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      studentName: invoice.student?.name || payerName,
      studentId: invoice.student?.studentId || invoice.student?.StudentId || "",
      classLevel: invoice.classLevel || "",
      academicYear: invoice.academicYear?.name || "",
      academicTerm: invoice.academicTerm?.name || "",
    },
  });

  // Call Paystack gateway adapter
  let gatewayResult;
  try {
    gatewayResult = await paystackService.initializeTransaction({
      email: payerEmail,
      amount: paymentKobo,
      amountInKobo: paymentKobo,
      reference,
      metadata: {
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.student._id.toString(),
        payerRole: user.role,
        payerId: user._id.toString(),
        transactionId: transaction._id.toString(),
      },
      callbackUrl: finalCallbackUrl,
    });
  } catch (err) {
    transaction.status = "failed";
    transaction.gatewayResponse = { error: err.message };
    await transaction.save();

    res.status(502);
    throw new Error(`Paystack initialization failed: ${err.message}`);
  }

  // Update transaction with gateway initialization info
  const authorizationUrl =
    gatewayResult.authorizationUrl || gatewayResult.authorization_url || "";
  const accessCode = gatewayResult.accessCode || gatewayResult.access_code || "";

  transaction.authorizationUrl = authorizationUrl;
  transaction.gatewayResponse = gatewayResult;
  await transaction.save();

  res.status(200).json({
    status: "success",
    message: "Payment initialized successfully",
    data: {
      authorizationUrl,
      accessCode,
      reference,
      transactionId: transaction._id,
      amountKobo: paymentKobo,
      amountNaira: paymentKobo / 100,
      currency: "NGN",
      invoiceNumber: invoice.invoiceNumber,
    },
  });
});

//@desc Verify Payment with Paystack and apply to Invoice
//@route GET /api/v1/finance/payments/verify/:reference
//@access Private (Admin, Student, Parent)
exports.verifyPaymentCtrl = AsyncHandler(async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    res.status(400);
    throw new Error("Payment reference is required");
  }

  const tx = await PaymentTransaction.findOne({ reference });
  if (!tx) {
    res.status(404);
    throw new Error("Payment transaction with this reference was not found");
  }

  // If already applied and marked success, return cached verification
  if (tx.isAppliedToInvoice && tx.status === "success") {
    const existingResult = await applyTransactionToInvoice(reference);
    const populatedReceipt = await Receipt.findOne({ transaction: tx._id })
      .populate("student", "name email studentId StudentId currentClassLevel")
      .populate("academicYear", "name")
      .populate("academicTerm", "name");

    return res.status(200).json({
      status: "success",
      message: "Payment already verified and recorded",
      data: {
        transaction: existingResult.transaction || tx,
        invoice: existingResult.invoice,
        receipt: populatedReceipt || existingResult.receipt,
        verified: true,
      },
    });
  }

  // Verify independently with Paystack
  let gatewayData;
  try {
    const verifyRes = await paystackService.verifyTransaction(reference);
    gatewayData = verifyRes.data || verifyRes;
  } catch (err) {
    res.status(502);
    throw new Error(`Failed to verify transaction with Paystack: ${err.message}`);
  }

  // Check gateway status
  if (gatewayData.status !== "success") {
    tx.status = gatewayData.status === "failed" ? "failed" : "abandoned";
    tx.gatewayStatus = gatewayData.status;
    tx.gatewayResponse = gatewayData;
    await tx.save();

    return res.status(400).json({
      status: "failed",
      message: `Transaction was not successful on Paystack (Gateway status: ${gatewayData.status})`,
      data: {
        reference,
        status: tx.status,
        gatewayStatus: gatewayData.status,
      },
    });
  }

  // Validate amount matches expected kobo amount
  if (Number(gatewayData.amount) !== Number(tx.amount)) {
    tx.status = "failed";
    tx.gatewayResponse = {
      error: "Amount mismatch detected",
      expected: tx.amount,
      received: gatewayData.amount,
      gatewayData,
    };
    await tx.save();

    res.status(400);
    throw new Error(
      `Payment amount mismatch. Expected ${tx.amount} kobo, but gateway verified ${gatewayData.amount} kobo`
    );
  }

  // Validate currency matches NGN
  if (gatewayData.currency !== "NGN") {
    tx.status = "failed";
    tx.gatewayResponse = { error: "Currency mismatch detected", currency: gatewayData.currency };
    await tx.save();

    res.status(400);
    throw new Error(`Invalid transaction currency: expected NGN, got ${gatewayData.currency}`);
  }

  // Apply to invoice idempotently
  const result = await applyTransactionToInvoice(reference, gatewayData);

  const populatedReceipt = await Receipt.findById(result.receipt?._id || result.transaction?.receipt)
    .populate("student", "name email studentId StudentId currentClassLevel")
    .populate("academicYear", "name")
    .populate("academicTerm", "name");

  res.status(200).json({
    status: "success",
    message: "Payment successfully verified and credited to invoice",
    data: {
      transaction: result.transaction,
      invoice: result.invoice,
      receipt: populatedReceipt,
      verified: true,
    },
  });
});

//@desc Paystack Webhook Handler (Idempotent Raw Signature Verified)
//@route POST /api/v1/finance/payments/webhook
//@access Public (Verified by Paystack HMAC SHA512 Signature)
exports.paystackWebhookCtrl = AsyncHandler(async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  const isValidSignature = paystackService.verifyWebhookSignature(rawBody, signature);
  if (!isValidSignature) {
    return res.status(401).send("Invalid Paystack webhook signature");
  }

  const event = req.body;
  if (!event || !event.event) {
    return res.status(400).send("Invalid event payload");
  }

  // Handle charge.success
  if (event.event === "charge.success") {
    const data = event.data;
    const reference = data.reference;

    if (!reference) {
      return res.status(200).send("No reference found in charge.success event");
    }

    const tx = await PaymentTransaction.findOne({ reference });
    if (!tx) {
      // Transaction might belong to another system or manual charge
      return res.status(200).send("Transaction reference not tracked by SMS");
    }

    // Verify amount in kobo matches
    if (Number(data.amount) === Number(tx.amount) && data.currency === "NGN") {
      try {
        await applyTransactionToInvoice(reference, data);
      } catch (applyErr) {
        console.error("Error applying webhook payment to invoice:", applyErr);
      }
    } else {
      console.warn("Webhook amount or currency mismatch for reference:", reference);
    }
  }

  // Acknowledge Paystack immediately with 200 OK
  res.status(200).send("Webhook received and processed");
});

//@desc Get Receipt by ID, Receipt Number, Invoice Number, or Payment Reference
//@route GET /api/v1/finance/receipts/:receiptId
//@access Private (Admin, Student, Parent)
exports.getReceiptCtrl = AsyncHandler(async (req, res) => {
  const { receiptId } = req.params;
  const cleanId = (receiptId || "").trim();

  let receipt = null;

  // 1. Check if cleanId is a valid ObjectId (could be Receipt _id, Invoice _id, or Transaction _id)
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    receipt = await Receipt.findOne({
      $or: [
        { _id: cleanId },
        { invoice: cleanId },
        { transaction: cleanId },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("student", "name email studentId StudentId currentClassLevel")
      .populate("academicYear", "name")
      .populate("academicTerm", "name")
      .populate("transaction")
      .populate("invoice");
  }

  // 2. Direct string match against receiptNumber, invoiceNumber, paymentReference, or gatewayReference
  if (!receipt) {
    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}$`, "i");
    receipt = await Receipt.findOne({
      $or: [
        { receiptNumber: regex },
        { invoiceNumber: regex },
        { paymentReference: regex },
        { gatewayReference: regex },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("student", "name email studentId StudentId currentClassLevel")
      .populate("academicYear", "name")
      .populate("academicTerm", "name")
      .populate("transaction")
      .populate("invoice");
  }

  // 3. Fallback: Lookup invoice by invoiceNumber or _id, then find its latest receipt
  if (!receipt) {
    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const invoice = await StudentInvoice.findOne({
      $or: [
        { invoiceNumber: new RegExp(`^${escaped}$`, "i") },
        ...(mongoose.Types.ObjectId.isValid(cleanId) ? [{ _id: cleanId }] : []),
      ],
    });

    if (invoice) {
      receipt = await Receipt.findOne({ invoice: invoice._id })
        .sort({ createdAt: -1 })
        .populate("student", "name email studentId StudentId currentClassLevel")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("transaction")
        .populate("invoice");
    }
  }

  if (!receipt) {
    res.status(404);
    throw new Error("Receipt not found");
  }

  // Ownership verification
  const user = req.userAuth;
  const receiptStudentId = (
    receipt.student?._id ||
    receipt.student ||
    ""
  ).toString();

  if (user.role === "student") {
    if (receiptStudentId !== user._id.toString()) {
      res.status(403);
      throw new Error("Access denied: You can only view your own receipts");
    }
  } else if (user.role === "parent") {
    const parentDoc = await Parent.findById(user._id);
    const hasChild = parentDoc?.children?.some(
      (cid) => cid.toString() === receiptStudentId
    );
    if (!hasChild) {
      res.status(403);
      throw new Error("Access denied: You can only view receipts for your linked children");
    }
  } else if (user.role !== "admin") {
    res.status(403);
    throw new Error("Access denied: Unauthorized role");
  }

  res.status(200).json({
    status: "success",
    data: receipt,
  });
});


//@desc Get All Receipts (with filters & authorization)
//@route GET /api/v1/finance/receipts
//@access Private (Admin, Student, Parent)
exports.getReceiptsCtrl = AsyncHandler(async (req, res) => {
  const user = req.userAuth;
  const { studentId, academicYear, academicTerm, classLevel, search } = req.query;

  let query = {};

  if (user.role === "student") {
    query.student = user._id;
  } else if (user.role === "parent") {
    const parentDoc = await Parent.findById(user._id);
    const childIds = parentDoc?.children || [];
    if (studentId && childIds.some((cid) => cid.toString() === studentId)) {
      query.student = studentId;
    } else {
      query.student = { $in: childIds };
    }
  } else if (user.role === "admin") {
    if (studentId) query.student = studentId;
  } else {
    res.status(403);
    throw new Error("Access denied");
  }

  if (academicYear) query.academicYear = academicYear;
  if (academicTerm) query.academicTerm = academicTerm;
  if (classLevel) query.classLevel = classLevel;
  if (search) {
    query.$or = [
      { receiptNumber: { $regex: search, $options: "i" } },
      { invoiceNumber: { $regex: search, $options: "i" } },
      { paymentReference: { $regex: search, $options: "i" } },
    ];
  }

  const receipts = await Receipt.find(query)
    .populate("student", "name email studentId StudentId currentClassLevel")
    .populate("academicYear", "name")
    .populate("academicTerm", "name")
    .sort({ paidAt: -1 });

  res.status(200).json({
    status: "success",
    count: receipts.length,
    data: receipts,
  });
});

//@desc Get Payment Transactions
//@route GET /api/v1/finance/transactions
//@access Private (Admin, Student, Parent)
exports.getPaymentTransactionsCtrl = AsyncHandler(async (req, res) => {
  const user = req.userAuth;
  const { studentId, status, search } = req.query;

  let query = {};

  if (user.role === "student") {
    query.student = user._id;
  } else if (user.role === "parent") {
    const parentDoc = await Parent.findById(user._id);
    const childIds = parentDoc?.children || [];
    if (studentId && childIds.some((cid) => cid.toString() === studentId)) {
      query.student = studentId;
    } else {
      query.student = { $in: childIds };
    }
  } else if (user.role === "admin") {
    if (studentId) query.student = studentId;
  } else {
    res.status(403);
    throw new Error("Access denied");
  }

  if (status) query.status = status;
  if (search) {
    query.$or = [
      { reference: { $regex: search, $options: "i" } },
      { payerName: { $regex: search, $options: "i" } },
      { payerEmail: { $regex: search, $options: "i" } },
    ];
  }

  const transactions = await PaymentTransaction.find(query)
    .populate("student", "name email studentId StudentId currentClassLevel")
    .populate("invoice", "invoiceNumber totalAmount amountPaid balanceAmount status")
    .populate("receipt", "receiptNumber")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    count: transactions.length,
    data: transactions,
  });
});

//@desc Get Finance Metrics and Summaries (Admin only)
//@route GET /api/v1/finance/metrics
//@access Private (Admin)
exports.getFinanceMetricsCtrl = AsyncHandler(async (req, res) => {
  const { academicYear, academicTerm, classLevel } = req.query;

  let invoiceFilter = {};
  if (academicYear) invoiceFilter.academicYear = academicYear;
  if (academicTerm) invoiceFilter.academicTerm = academicTerm;
  if (classLevel) invoiceFilter.classLevel = classLevel;

  // Aggregate invoices totals
  const invoiceAgg = await StudentInvoice.aggregate([
    { $match: invoiceFilter },
    {
      $group: {
        _id: null,
        totalInvoicedKobo: { $sum: "$totalAmount" },
        totalCollectedKobo: { $sum: "$amountPaid" },
        totalOutstandingKobo: { $sum: "$balanceAmount" },
        totalInvoicesCount: { $sum: 1 },
        unpaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] },
        },
        partiallyPaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "partially_paid"] }, 1, 0] },
        },
        paidCount: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
        },
        overdueCount: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
        },
      },
    },
  ]);

  const metrics = invoiceAgg[0] || {
    totalInvoicedKobo: 0,
    totalCollectedKobo: 0,
    totalOutstandingKobo: 0,
    totalInvoicesCount: 0,
    unpaidCount: 0,
    partiallyPaidCount: 0,
    paidCount: 0,
    overdueCount: 0,
  };

  // Convert to Naira
  const summary = {
    totalInvoicedNaira: metrics.totalInvoicedKobo / 100,
    totalCollectedNaira: metrics.totalCollectedKobo / 100,
    totalOutstandingNaira: metrics.totalOutstandingKobo / 100,
    totalInvoicedKobo: metrics.totalInvoicedKobo,
    totalCollectedKobo: metrics.totalCollectedKobo,
    totalOutstandingKobo: metrics.totalOutstandingKobo,
    totalInvoicesCount: metrics.totalInvoicesCount,
    unpaidCount: metrics.unpaidCount,
    partiallyPaidCount: metrics.partiallyPaidCount,
    paidCount: metrics.paidCount,
    overdueCount: metrics.overdueCount,
  };

  // Recent transactions
  const recentTransactions = await PaymentTransaction.find({ status: "success" })
    .populate("student", "name studentId StudentId currentClassLevel")
    .sort({ paidAt: -1 })
    .limit(10);

  // Revenue breakdown by class
  const classBreakdown = await StudentInvoice.aggregate([
    { $match: invoiceFilter },
    {
      $group: {
        _id: "$classLevel",
        invoicedKobo: { $sum: "$totalAmount" },
        collectedKobo: { $sum: "$amountPaid" },
        outstandingKobo: { $sum: "$balanceAmount" },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    status: "success",
    data: {
      summary,
      recentTransactions,
      classBreakdown: classBreakdown.map((item) => ({
        classLevel: item._id,
        invoicedNaira: item.invoicedKobo / 100,
        collectedNaira: item.collectedKobo / 100,
        outstandingNaira: item.outstandingKobo / 100,
        invoiceCount: item.invoiceCount,
      })),
    },
  });
});
