export const money = (n: any, ccy = 'INR') => {
    const v = Number(n ?? 0);
    try {
        return v.toLocaleString('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 2 });
    } catch {
        return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
};

export const pct = (n: any) =>
    n === null || n === undefined ? '—' : `${Math.round(Number(n) * 100)}%`;

const amt = (v: any) => (v && typeof v === 'object' ? v.amount : v);
export const moneyMaybe = (v: any, ccy = 'INR') => money(amt(v), ccy);

// plain words for backend enums ------------------------------------------------
export const WHY_FAILED: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'Not enough money in the account',
    NETWORK_FAILURE: 'A temporary network / bank glitch',
    PAYMENT_METHOD_INVALID: 'The card or payment method is no longer valid',
    PAYMENT_FRICTION: 'The customer got stuck at payment',
    MANDATE_FAILURE: 'The recurring-payment authorisation broke',
    UNRESOLVED_DISPUTE: 'There is an open dispute on the invoice',
    MISSED_COMMITMENT: 'The customer missed a promised payment date',
    CONFLICTING_EVIDENCE: 'The signals disagree — needs a look',
    UNKNOWN: 'Cause not clear from the data',
};

export const ACTION: Record<string, string> = {
    RETRY_PAYMENT: 'Retry the payment',
    RETRY_BILLING: 'Retry the charge',
    REQUEST_PAYMENT_METHOD_UPDATE: 'Ask the customer to update their card',
    SEND_PAYMENT_REMINDER: 'Send a payment reminder',
    SEND_CHECKOUT_REMINDER: 'Send a checkout reminder',
    OFFER_CHECKOUT_ASSISTANCE: 'Offer checkout help',
    SEND_SUBSCRIPTION_REMINDER: 'Send a subscription reminder',
    SEND_INVOICE_REMINDER: 'Send an invoice reminder',
    SEND_PAYMENT_LINK: 'Send a payment link',
    ESCALATE_COLLECTION: 'Hand to collections',
    SEND_PROMISE_REMINDER: 'Remind about the promised payment',
    REQUEST_NEW_COMMITMENT: 'Ask for a new payment date',
    ESCALATE_TO_HUMAN: 'Needs human review',
    NO_ACTION_POSSIBLE: 'Nothing to do',
};

// plain names for the real PolicyEngine rule_names
export const RULE_LABEL: Record<string, string> = {
    FinancialAutomatedLimit: 'Automated-amount limit',
    PaymentMaxRetries: 'Retry limit',
    PaymentRetryCooldown: 'Cooling period',
    CommunicationMaxMessages: 'Contact limit',
    HumanEscalationAction: 'Human-approval threshold',
    StopRule: 'Stop rule',
    ConsentCheck: 'Consent',
    EvidenceCheck: 'Evidence present',
};

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'violet';

export function policyVerdict(status?: string): { label: string; tone: Tone; note: string } {
    switch (status) {
        case 'PERMITTED': return { label: 'Approved', tone: 'green', note: 'Safe to act on automatically.' };
        case 'WAIT': return { label: 'Wait', tone: 'amber', note: 'In a cooling period — try again later.' };
        case 'ESCALATE': return { label: 'Needs approval', tone: 'amber', note: 'Above the automated limit — a person must approve.' };
        case 'DENIED': return { label: 'Blocked', tone: 'red', note: 'A safety rule stops this action.' };
        default: return { label: 'Not checked', tone: 'gray', note: '' };
    }
}

export function outcomeVerdict(status?: string): { label: string; tone: Tone } {
    switch (status) {
        case 'FULLY_RECOVERED': return { label: 'Recovered', tone: 'green' };
        case 'PARTIALLY_RECOVERED': return { label: 'Partially recovered', tone: 'amber' };
        case 'NOT_RECOVERED': return { label: 'Not recovered', tone: 'red' };
        case 'PENDING_VERIFICATION': return { label: 'Pending', tone: 'blue' };
        default: return { label: 'Not run', tone: 'gray' };
    }
}

export function riskWord(level?: string): { label: string; tone: Tone } {
    switch (level) {
        case 'CRITICAL': return { label: 'Critical', tone: 'red' };
        case 'HIGH': return { label: 'High', tone: 'red' };
        case 'MEDIUM': return { label: 'Medium', tone: 'amber' };
        case 'LOW': return { label: 'Low', tone: 'gray' };
        default: return { label: '—', tone: 'gray' };
    }
}

export function confidenceTone(c?: string): Tone {
    return c === 'HIGH' ? 'green' : c === 'MEDIUM' ? 'blue' : c === 'LOW' ? 'amber' : 'gray';
}

export const CATEGORY: Record<string, string> = {
    FAILED_PAYMENT: 'Failed payment',
    CHECKOUT_ABANDONMENT: 'Abandoned checkout',
    FAILED_SUBSCRIPTION: 'Failed subscription',
    OVERDUE_INVOICE: 'Overdue invoice',
    BROKEN_PROMISE: 'Broken promise to pay',
};

// which of the four roles a detected canonical field fills (for step 4)
export const ROLE_OF: Record<string, string> = {
    CUSTOMER_ID: 'Customer', ACCOUNT_ID: 'Customer', ENTITY_ID: 'Customer',
    AMOUNT: 'Amount', BALANCE: 'Amount',
    TIMESTAMP: 'Date', SETTLEMENT_DATE: 'Date',
    OUTCOME: 'Result', TARGET: 'Result',
    TRANSACTION_ID: 'Transaction ID', STATUS: 'Status', CURRENCY: 'Currency',
    PAYMENT_METHOD: 'Payment method',
};
